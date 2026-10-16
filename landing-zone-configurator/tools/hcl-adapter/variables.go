package main

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"os"

	"github.com/hashicorp/hcl/v2/ext/typeexpr"
	"github.com/hashicorp/hcl/v2/hclparse"
	"github.com/hashicorp/hcl/v2/hclsyntax"
	ctyjson "github.com/zclconf/go-cty/cty/json"
)

type variableDefinition struct {
	Name           string             `json:"name"`
	Line           int                `json:"line"`
	Description    string             `json:"description"`
	Type           json.RawMessage    `json:"type"`
	Required       bool               `json:"required"`
	Sensitive      bool               `json:"sensitive"`
	Default        json.RawMessage    `json:"default,omitempty"`
	NestedDefaults *defaultDefinition `json:"nestedDefaults,omitempty"`
	Validations    []string           `json:"validations,omitempty"`
}
type defaultDefinition struct {
	Values   map[string]json.RawMessage    `json:"values,omitempty"`
	Children map[string]*defaultDefinition `json:"children,omitempty"`
}

func encodeDefaults(input *typeexpr.Defaults) (*defaultDefinition, error) {
	if input == nil {
		return nil, nil
	}
	result := &defaultDefinition{Values: map[string]json.RawMessage{}, Children: map[string]*defaultDefinition{}}
	for key, value := range input.DefaultValues {
		encoded, err := ctyjson.Marshal(value, value.Type())
		if err != nil {
			return nil, err
		}
		result.Values[key] = encoded
	}
	for key, child := range input.Children {
		encoded, err := encodeDefaults(child)
		if err != nil {
			return nil, err
		}
		result.Children[key] = encoded
	}
	return result, nil
}

// Read only the trusted Accelerator source. Never evaluate external functions or user HCL.
func variableInventory(path string) ([]byte, error) {
	source, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	file, diagnostics := hclparse.NewParser().ParseHCL(source, path)
	if diagnostics.HasErrors() {
		return nil, fmt.Errorf("%s", diagnostics.Error())
	}
	definitions := []variableDefinition{}
	for _, block := range file.Body.(*hclsyntax.Body).Blocks {
		if block.Type != "variable" {
			continue
		}
		if len(block.Labels) != 1 {
			return nil, fmt.Errorf("invalid variable label")
		}
		attrs := block.Body.Attributes
		if attrs["type"] == nil {
			return nil, fmt.Errorf("%s: explicit type required", block.Labels[0])
		}
		valueType, defaults, diagnostics := typeexpr.TypeConstraintWithDefaults(attrs["type"].Expr)
		if diagnostics.HasErrors() {
			return nil, fmt.Errorf("%s", diagnostics.Error())
		}
		encodedType, err := ctyjson.MarshalType(valueType)
		if err != nil {
			return nil, err
		}
		definition := variableDefinition{Name: block.Labels[0], Line: block.DefRange().Start.Line, Type: encodedType, Required: attrs["default"] == nil}
		if attr := attrs["description"]; attr != nil {
			value, diagnostics := attr.Expr.Value(nil)
			if diagnostics.HasErrors() {
				return nil, fmt.Errorf("%s", diagnostics.Error())
			}
			definition.Description = value.AsString()
		}
		if attr := attrs["sensitive"]; attr != nil {
			value, diagnostics := attr.Expr.Value(nil)
			if diagnostics.HasErrors() {
				return nil, fmt.Errorf("%s", diagnostics.Error())
			}
			definition.Sensitive = value.True()
		}
		// Sensitive defaults are deliberately absent, including all nested defaults.
		if !definition.Sensitive {
			definition.NestedDefaults, err = encodeDefaults(defaults)
			if err != nil {
				return nil, err
			}
			if attr := attrs["default"]; attr != nil {
				value, diagnostics := attr.Expr.Value(nil)
				if diagnostics.HasErrors() {
					return nil, fmt.Errorf("%s", diagnostics.Error())
				}
				definition.Default, err = ctyjson.Marshal(value, value.Type())
				if err != nil {
					return nil, err
				}
			}
		}
		for _, rule := range block.Body.Blocks {
			if rule.Type == "validation" {
				definition.Validations = append(definition.Validations, string(rule.Range().SliceBytes(source)))
			}
		}
		definitions = append(definitions, definition)
	}
	if len(definitions) == 0 {
		return nil, fmt.Errorf("no variables found")
	}
	result := struct {
		SchemaVersion int                  `json:"schemaVersion"`
		SourceSHA256  string               `json:"sourceSha256"`
		Variables     []variableDefinition `json:"variables"`
	}{1, fmt.Sprintf("%x", sha256.Sum256(source)), definitions}
	encoded, err := json.MarshalIndent(result, "", "  ")
	return append(encoded, '\n'), err
}
