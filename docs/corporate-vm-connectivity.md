# Corporate VM connectivity through OPNsense

[English](corporate-vm-connectivity.md) | [Deutsch](corporate-vm-connectivity.de.md)

A successful Corporate Application Apply creates the project/network foundation;
it does not by itself establish an application firewall policy. This runbook covers
IPv4 Internet access and optional inbound SSH for a VM in that existing network.
It applies to standalone Accelerator deployments and the Configurator's manual
firewall-administrator handover. Use the real allocated prefixes and addresses;
all addresses below are documentation examples, not deployment defaults.

## Check the traffic path first

```text
VM → STACKIT network gateway → Application routing table → firewall LAN
   → firewall WAN → STACKIT public-IP translation → Internet
```

Verify the VM NIC belongs to the intended Corporate network, that the network uses
the intended routing table, and that its `0.0.0.0/0` route targets the platform's
firewall LAN address (the CARP LAN VIP when HA is configured). Check system/dynamic
and more-specific routes as well: a default route alone does not prove every flow
crosses the firewall. The guest normally uses the STACKIT subnet gateway, not the
firewall address, as its DHCP-provided default gateway. Do not replace it blindly.

A Corporate route does not prevent users with sufficient IAM permissions from
allocating public IPs or adding other network paths. For a firewall-only design,
remove an unnecessary VM public-IP association after confirming the intended access
path, review other NICs/routes and enforce the customer's project permissions.
The connectivity acceptance below did not qualify prevention of direct public access.

## Configure the firewall return route

OPNsense must know that Application prefixes are reachable through its LAN gateway.
Under **System → Routes → Configuration**, add the allocated Application prefix,
or a deliberately selected SNA aggregate, through the gateway for the LAN network
(typically `LAN_DHCP`; verify the actual gateway name and address on the appliance).
Keep the Internet default route through WAN. Inspect the effective route to the VM.
Do not route the WAN gateway or unrelated destinations through LAN with an overly
broad aggregate.

Without this route the firewall may send spoke-bound packets through WAN. A working
connection alone therefore does not establish the intended symmetric LAN path.
See the native [firewall route contract](../src/modules/firewall-config/README.md#routes).

## Permit the required outbound traffic

On **Firewall → Rules → LAN** (or the corresponding automation ruleset), permit
traffic arriving from the actual Application prefix to approved destinations and
ports. The directly connected **LAN net** is the firewall transit subnet, not the
remote Application subnet. Check floating, group and interface-rule ordering and
log the relevant rules while diagnosing traffic.

For example, allow UDP and TCP port 53 to the configured DNS resolvers and TCP port
443 to approved services. Add ICMP only when required for the test or policy. A
temporary allow-all rule can isolate a filtering problem, but replace it with the
customer's intended policy after testing. A pass log proves only that particular
packet was permitted; it does not prove successful NAT or return traffic.

## Add outbound source NAT

In the tested deployment, **Automatic** outbound NAT had no rule for the remote
Application prefix. DNS queries reached the firewall, but neither DNS resolution
nor an Internet IP connectivity test succeeded. An explicit outbound NAT rule fixed
that path; do not assume automatic rules include routed Application networks.

For a rule managed manually in the GUI, open **Firewall → NAT → Outbound** (also
labelled **Source NAT** in newer interfaces), select **Hybrid** to retain automatic
rules and allow additional manual rules, save, then add:

| Field | Value |
| --- | --- |
| Interface | WAN |
| IP version / protocol | IPv4 / any |
| Source | Actual Application subnet, for example `10.42.3.0/24` |
| Source port | any |
| Destination / port | any, or the destinations required by policy |
| Translation address | WAN interface address |
| Static port | Disabled unless a specific protocol requires it |

Save and apply. The appliance WAN address is private in this topology; STACKIT maps
its associated public IP at the edge. Do not substitute the VM's public IP or an
unrelated public address as the translation target. Restrict the source to the
approved prefix; add deliberate no-NAT exceptions ahead of a general rule if needed.

GUI rules and provider-managed automation rules are different paths. Native
`firewall_config.outbound_nat` automation rules do not require switching the GUI
mode; see the [module NAT documentation](../src/modules/firewall-config/README.md#nat).
Avoid managing the same policy in both places without an explicit ownership plan.
The GUI mode and filter-association behavior are described in the
[official OPNsense NAT manual](https://docs.opnsense.org/manual/nat.html).

## Verify DNS separately from IP connectivity

Run read-only commands inside the VM, through SSH or the server agent:

```sh
ip -4 route
cat /etc/resolv.conf
resolvectl status
getent ahostsv4 example.com
curl -I --connect-timeout 5 https://example.com
```

Use a permitted numeric destination with `ping -n -c 3 -W 2 <test-ip>` if ICMP is
allowed. A failed ping alone is not proof that all IP connectivity is broken.
`127.0.0.53` in `/etc/resolv.conf` is normal for systemd-resolved; inspect the actual
upstream resolvers with `resolvectl`. Match firewall captures/logs on LAN and WAN:
check the permitted query, translated WAN source and returning response. Review
STACKIT security-group egress and the guest firewall as independent controls.

## Optional external SSH through the firewall

A VM does not need its own public IP for this path:

```text
approved client → firewall public IPv4:2222 → DNAT → VM private IPv4:22
```

Create a **Firewall → NAT → Port Forward / Destination NAT** entry:

| Field | Value |
| --- | --- |
| Interface / version / protocol | WAN / IPv4 / TCP |
| Source | Approved client public IP/CIDR, for example `198.51.100.25/32` |
| Source port | any |
| Destination | WAN address |
| Destination port | `2222` |
| Redirect target | VM private address, for example `10.42.3.20` |
| Redirect port | `22` |

Create or associate the corresponding WAN pass rule for the **translated**
destination (VM private address, TCP/22), restricted to the same source. UI labels
vary by OPNsense version. Native `firewall_config.port_forwards` requires an explicit
matching filter rule; the provider does not create one automatically.

Check the remaining layers independently:

- Firewall WAN NIC security group: inbound TCP/2222 from the approved client.
- VM NIC security group: inbound TCP/22 from that client when DNAT preserves its
  original source. Attach the group to the VM; merely creating it has no effect.
  If additional source NAT is intentional, verify the actual source at the VM.
- Guest: SSH service listening, host firewall permits the connection, intended
  login user exists, and that user's `authorized_keys` contains the matching key.

Test from outside, using the firewall public address:

```sh
ssh -i ~/.ssh/your_application_key -o IdentitiesOnly=yes \
  -o PreferredAuthentications=publickey -p 2222 \
  <existing-user>@<firewall-public-ip>
```

Do not assume an Ubuntu image has an `ubuntu` user: the tested VM did not. Check
`getent passwd <user>` through the server agent and provision the intended user/key
through your approved bootstrap process. Never paste private keys into diagnostics.
`Too many authentication failures` can mean the SSH agent offered too many unrelated
keys; an explicit identity avoids that. A password prompt after key rejection points
to guest user/key/authentication configuration, not a broken TCP forwarding path.
Do not reuse the firewall administrator password as a guest password.

## Acceptance boundaries and HA

The user-confirmed Corporate test established successful Apply recovery, Internet/DNS
after manual outbound NAT and external SSH after manual DNAT, security-group
attachment and guest user/key setup. It did not qualify HA policy synchronization,
failover, all-traffic enforcement or denied-client isolation. Verify those separately.
A LAN CARP VIP does not automatically provide a floating WAN public-IP entry point.
For HA, explicitly manage node-local routing, policy synchronization and which public
address is used for inbound access; test each required failure path.

Keep the intended routes, rules and NAT in the customer's chosen configuration source.
A later Apply must not silently conflict with manual changes. Guided policy editing
and Assistant rule/NAT proposals remain tracked in [#101](https://github.com/stackitcloud/stackit-landing-zone/issues/101),
and multi-appliance policy automation in [#65](https://github.com/stackitcloud/stackit-landing-zone/issues/65).
