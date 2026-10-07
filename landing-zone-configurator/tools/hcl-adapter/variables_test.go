package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestCompleteRootVariableInventory(t *testing.T) {
	raw, err := variableInventory("../../../src/variables.tf")
	if err != nil {
		t.Fatal(err)
	}
	var result struct {
		Variables []variableDefinition `json:"variables"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		t.Fatal(err)
	}
	if len(result.Variables) != 29 {
		t.Fatalf("review Accelerator feature coverage: %d inputs", len(result.Variables))
	}
	variables := map[string]variableDefinition{}
	for _, variable := range result.Variables {
		variables[variable.Name] = variable
	}
	namespace, exists := variables["platform_contract_namespace"]
	if !exists || string(namespace.Type) != `"string"` || namespace.Sensitive || len(namespace.Validations) == 0 {
		t.Fatal("platform contract namespace metadata lost")
	}
	var compact bytes.Buffer
	if err := json.Compact(&compact, variables["connectivity_regions"].Type); err != nil {
		t.Fatal(err)
	}
	if compact.String() != `["map","dynamic"]` {
		t.Fatal("must preserve dynamic region input for explicit semantic review")
	}
	if string(variables["audit_logs"].NestedDefaults.Values["s3_object_lock"]) != "true" {
		t.Fatal("inventory must use actual defaults, not the contradictory description")
	}
	if len(variables["landing_zones"].Validations) == 0 {
		t.Fatal("dependency checks lost")
	}
	for _, name := range []string{"firewall_admin_password", "firewall_api_credentials", "vpn_pre_shared_keys", "platform_kubernetes_kube_config_override"} {
		variable := variables[name]
		if !variable.Sensitive || len(variable.Default) != 0 || variable.NestedDefaults != nil {
			t.Fatalf("sensitive default exposed: %s", name)
		}
	}
}
func TestInventoryNeverEmitsSensitiveDefaults(t *testing.T) {
	path := filepath.Join(t.TempDir(), "variables.tf")
	err := os.WriteFile(path, []byte("variable \"secret\" {\n type = object({ token = optional(string, \"nested-secret-marker\") })\n sensitive = true\n default = { token = \"secret-marker\" }\n}\n"), 0600)
	if err != nil {
		t.Fatal(err)
	}
	raw, err := variableInventory(path)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(raw, []byte("secret-marker")) {
		t.Fatal("secret default escaped into inventory")
	}
}
