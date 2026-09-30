// Command hcl-adapter builds a deterministic catalogue from trusted repo templates.
package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/hashicorp/hcl/v2/hclparse"
	ctyjson "github.com/zclconf/go-cty/cty/json"
)

type template struct {
	ID     string                     `json:"id"`
	Source string                     `json:"source"`
	SHA256 string                     `json:"sha256"`
	Values map[string]json.RawMessage `json:"values"`
}

func parse(src []byte, name string) (map[string]json.RawMessage, error) {
	file, diagnostics := hclparse.NewParser().ParseHCL(src, name)
	if diagnostics.HasErrors() {
		return nil, fmt.Errorf("%s", diagnostics.Error())
	}
	attrs, diagnostics := file.Body.JustAttributes()
	if diagnostics.HasErrors() {
		return nil, fmt.Errorf("%s", diagnostics.Error())
	}
	values := make(map[string]json.RawMessage)
	for name, attr := range attrs {
		// No variables or function context: no file(), env lookup or external execution.
		value, diagnostics := attr.Expr.Value(nil)
		if diagnostics.HasErrors() {
			return nil, fmt.Errorf("%s", diagnostics.Error())
		}
		encoded, err := ctyjson.Marshal(value, value.Type())
		if err != nil {
			return nil, err
		}
		values[name] = encoded
	}
	return values, nil
}

func catalogue(dir string) ([]byte, error) {
	files, err := filepath.Glob(filepath.Join(dir, "*.tfvars"))
	if err != nil {
		return nil, err
	}
	if len(files) == 0 {
		return nil, fmt.Errorf("no templates found")
	}
	sort.Strings(files)
	templates := make([]template, 0, len(files))
	for _, path := range files {
		source, err := os.ReadFile(path)
		if err != nil {
			return nil, err
		}
		values, err := parse(source, filepath.Base(path))
		if err != nil {
			return nil, err
		}
		templates = append(templates, template{
			ID:     strings.TrimSuffix(filepath.Base(path), ".tfvars"),
			Source: "src/config/" + filepath.Base(path),
			SHA256: fmt.Sprintf("%x", sha256.Sum256(source)), Values: values,
		})
	}
	encoded, err := json.MarshalIndent(struct {
		SchemaVersion int        `json:"schemaVersion"`
		Templates     []template `json:"templates"`
	}{1, templates}, "", "  ")
	return append(encoded, '\n'), err
}

func main() {
	dir := flag.String("source", "../../../src/config", "trusted repository template directory")
	out := flag.String("output", "../../app/packages/domain/src/catalogue.json", "catalogue output")
	check := flag.Bool("check", false, "fail if committed output differs; do not write")
	variables := flag.String("variables-source", "", "trusted variable declarations; switches from template catalogue to variable inventory")
	flag.Parse()
	var data []byte
	var err error
	if *variables != "" {
		data, err = variableInventory(*variables)
	} else {
		data, err = catalogue(*dir)
	}
	if err == nil && *check {
		var existing []byte
		existing, err = os.ReadFile(*out)
		if err == nil && !bytes.Equal(existing, data) {
			err = fmt.Errorf("generated catalogue/inventory is stale; regenerate from trusted source")
		}
	} else if err == nil {
		err = os.MkdirAll(filepath.Dir(*out), 0755)
		if err == nil {
			err = os.WriteFile(*out, data, 0644)
		}
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
