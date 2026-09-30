package main

import (
	"encoding/json"
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
