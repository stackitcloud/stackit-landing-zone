# Source immediately before applying a reviewed saved plan. The encrypted plan
# contains all input values; external TF_VAR values must not override them.
# OpenTofu 1.12.6 otherwise compares typed plan booleans with raw environment input.
for lzc_input_name in "${!TF_VAR_@}"; do
  unset "$lzc_input_name"
done
unset lzc_input_name
