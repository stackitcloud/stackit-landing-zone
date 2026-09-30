package main

import (
	"bytes"
	"encoding/json"
	"os/exec"
	"reflect"
	"testing"
)

func TestParsePreservesNestedValuesAndIgnoresComments(t *testing.T) {
	values, err := parse([]byte("# fake = true\nlabels = { text = \"a=b # literal\" }\nzones = [{ enabled = false, count = 2 }]\n"), "test.tfvars")
	if err != nil {
		t.Fatal(err)
	}
	var labels map[string]string
	if err := json.Unmarshal(values["labels"], &labels); err != nil {
		t.Fatal(err)
	}
	if labels["text"] != "a=b # literal" || values["fake"] != nil {
		t.Fatal("lost literal or parsed comment")
	}
	if string(values["zones"]) != `[{"count":2,"enabled":false}]` {
		t.Fatal(string(values["zones"]))
	}
}

func TestRejectsFunctionsReferencesAndBlocks(t *testing.T) {
	for _, source := range []string{`secret = file("/etc/passwd")`, `value = var.secret`, `resource "x" "y" {}`, "x = 1\nx = 2"} {
		if _, err := parse([]byte(source), "invalid.tfvars"); err == nil {
			t.Fatalf("accepted %s", source)
		}
	}
}

func TestRepositoryTemplates(t *testing.T) {
	result, err := catalogue("../../../src/config")
	if err != nil {
		t.Fatal(err)
	}
	var decoded struct {
		Templates []template `json:"templates"`
	}
	if err := json.Unmarshal(result, &decoded); err != nil {
		t.Fatal(err)
	}
	if len(decoded.Templates) != 8 {
		t.Fatalf("review catalogue change: got %d templates", len(decoded.Templates))
	}
}

// Exercise the production TypeScript exporter against the real HCL evaluator.
// Node 24 strips TypeScript types; no generated fixture can mask exporter regressions.
func TestConfiguratorExportRoundTrip(t *testing.T) {
	fixtures := []map[string]json.RawMessage{}
	data, err := catalogue("../../../src/config")
	if err != nil {
		t.Fatal(err)
	}
	var decoded struct {
		Templates []template `json:"templates"`
	}
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatal(err)
	}
	for _, template := range decoded.Templates {
		fixtures = append(fixtures, template.Values)
	}
	literal := map[string]any{
		"text":   "${file(\"/etc/passwd\")} %{ if true } $${already} %%{literal}\\back\\form\n\r\t\b\f\x00\"ä😀",
		"nested": map[string]any{"${key}": []any{nil, true, false, 2.5, -2, map[string]any{}, []any{}}},
	}
	encoded, _ := json.Marshal(literal)
	var special map[string]json.RawMessage
	if err := json.Unmarshal(encoded, &special); err != nil {
		t.Fatal(err)
	}
	fixtures = append(fixtures, special)
	for i, values := range fixtures {
		input, _ := json.Marshal(values)
		cmd := exec.Command("node", "--input-type=module", "-e", `import {serializeTfvars} from '../../app/packages/domain/src/tfvars.ts'; let input=''; for await (const chunk of process.stdin) input+=chunk; process.stdout.write(serializeTfvars(JSON.parse(input)));`)
		cmd.Stdin = bytes.NewReader(input)
		output, err := cmd.Output()
		if err != nil {
			t.Fatalf("fixture %d: exporter failed: %v", i, err)
		}
		parsed, err := parse(output, "generated.tfvars")
		if err != nil {
			t.Fatalf("fixture %d: %v", i, err)
		}
		actualJSON, _ := json.Marshal(parsed)
		var expected, actual any
		json.Unmarshal(input, &expected)
		json.Unmarshal(actualJSON, &actual)
		if !reflect.DeepEqual(expected, actual) {
			t.Fatalf("fixture %d: HCL export changed values", i)
		}
	}
}
