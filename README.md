# EXP Test Framework

EXP is a new test framework from Tesults. Visit https://www.tesults.com/exp for complete details about EXP and how to use it.

## Installation

`npm install exp-tf --save`

## Documentation

Documentation is available at https://www.tesults.com/exp

## GitHub Actions reporting

Install `exp-tf` and run EXP after setting up the Tesults reporting action:

```yaml
- name: Set up test automation reporting
  uses: tesults/test-automation-reporting@v1

- name: Run EXP tests
  run: npx exp dir=/full/path/to/tests
```

The action sets `TESULTS_OUTPUT_FILE` automatically. Existing target-token uploads continue to work, and both destinations are written when `tesults-target` and the environment variable are present.

## Support

help@tesults.com
