# Form Interaction Reference

This reference covers techniques for interacting with HTML forms using the agent-browser skill, including input filling, selection, submission, and validation handling.

## Overview

Forms are a critical part of web automation. The agent-browser skill provides robust methods for:
- Filling text inputs, textareas, and rich text editors
- Selecting options from dropdowns and multi-selects
- Toggling checkboxes and radio buttons
- Uploading files
- Submitting forms and handling responses
- Detecting and handling validation errors

---

## Locating Form Elements

Before interacting with form fields, you need reliable selectors. Prefer accessible attributes over positional selectors.

### Recommended Selector Priority

1. `aria-label` or `aria-labelledby`
2. `name` attribute
3. `id` attribute
4. `placeholder` text
5. Label text (via `label[for]` association)
6. CSS class (last resort)

```bash
# Good: semantic selector
browser_action click --ref "input[name='email']"

# Good: aria-based
browser_action click --ref "[aria-label='Email address']"

# Avoid: brittle positional
browser_action click --ref "form > div:nth-child(2) > input"
```

---

## Text Input Fields

### Basic Fill

```bash
# Clear and type into a text field
browser_action fill --ref "input[name='username']" --value "john_doe"

# Fill a textarea
browser_action fill --ref "textarea[name='message']" --value "Hello, this is my message."
```

### Type with Delay (Human-like)

Useful for sites with bot detection that monitor typing speed.

```bash
browser_action type --ref "input[name='search']" --value "open agents" --delay 80
```

### Clear a Field

```bash
# Select all and delete before typing
browser_action press --ref "input[name='email']" --key "Control+a"
browser_action press --ref "input[name='email']" --key "Delete"
```

---

## Dropdowns and Selects

### Native `<select>` Elements

```bash
# Select by visible text
browser_action select --ref "select[name='country']" --value "United States"

# Select by option value attribute
browser_action select --ref "select[name='country']" --option-value "US"

# Multi-select
browser_action select --ref "select[name='tags']" --value "TypeScript" --value "Node.js"
```

### Custom Dropdown Components

Many modern UIs use custom dropdowns (not native `<select>`). These require click-based interaction.

```bash
# 1. Click to open the dropdown
browser_action click --ref "[data-testid='country-select']"

# 2. Wait for options to appear
browser_action wait --selector "[role='listbox']"

# 3. Click the desired option
browser_action click --ref "[role='option'][data-value='US']"
```

---

## Checkboxes and Radio Buttons

### Checkboxes

```bash
# Check a checkbox (only if unchecked)
browser_action check --ref "input[name='agree_terms']"

# Uncheck
browser_action uncheck --ref "input[name='newsletter']"

# Toggle (click regardless of state)
browser_action click --ref "input[name='remember_me']"
```

### Radio Buttons

```bash
# Select a radio option
browser_action click --ref "input[type='radio'][value='monthly']"

# Verify selection state before acting
browser_action evaluate --expression "document.querySelector('input[value=\"monthly\"]').checked"
```

---

## File Uploads

```bash
# Upload a single file
browser_action upload --ref "input[type='file']" --path "/tmp/document.pdf"

# Upload multiple files
browser_action upload --ref "input[type='file'][multiple]" \
  --path "/tmp/photo1.jpg" \
  --path "/tmp/photo2.jpg"
```

> **Note:** For drag-and-drop upload zones, use `browser_action drop` with a file path instead.

---

## Form Submission

```bash
# Click submit button
browser_action click --ref "button[type='submit']"

# Press Enter on a focused field (single-field forms)
browser_action press --ref "input[name='search']" --key "Enter"

# Submit via JavaScript (bypass UI validation)
browser_action evaluate --expression "document.querySelector('form#login').submit()"
```

---

## Handling Validation Errors

### Detecting Inline Errors

```bash
# Wait for error message to appear
browser_action wait --selector ".field-error, [role='alert']"

# Extract error text
browser_action evaluate --expression "
  Array.from(document.querySelectorAll('.field-error'))
    .map(el => el.textContent.trim())
"
```

### HTML5 Constraint Validation

```bash
# Check if a field is valid
browser_action evaluate --expression "document.querySelector('input[name=\'email\']').validity.valid"

# Get validation message
browser_action evaluate --expression "document.querySelector('input[name=\'email\']').validationMessage"
```

---

## Rich Text Editors

Rich text editors (Quill, TipTap, ProseMirror, Draft.js) require special handling.

```bash
# Click the editor content area to focus
browser_action click --ref ".ql-editor"

# Type content
browser_action type --ref ".ql-editor" --value "This is **bold** content."

# Use toolbar buttons for formatting
browser_action click --ref ".ql-bold"
```

---

## Complete Example: Login Form

```bash
#!/usr/bin/env bash
# Example: Fill and submit a login form

set -euo pipefail

URL="https://example.com/login"

# Navigate to login page
browser_action navigate --url "$URL"
browser_action wait --selector "form#login-form"

# Fill credentials
browser_action fill --ref "input[name='email']" --value "user@example.com"
browser_action fill --ref "input[name='password']" --value "$LOGIN_PASSWORD"

# Optionally check 'Remember me'
browser_action check --ref "input[name='remember_me']"

# Submit
browser_action click --ref "button[type='submit']"

# Wait for redirect or success indicator
browser_action wait --selector "[data-testid='dashboard']"

echo "Login successful"
```

---

## Troubleshooting

| Issue | Cause | Solution |
|---|---|---|
| Field not filling | Element not interactable (disabled/hidden) | Check visibility and enabled state first |
| Select option not found | Value mismatch | Use `evaluate` to list available options |
| Form submits but page doesn't change | JS validation blocking | Check for error elements after submit |
| File upload fails | Input hidden by custom UI | Use `evaluate` to force-set files property |
| Checkbox won't check | Custom styled checkbox uses `<div>` | Target the visual element, not the hidden input |

---

## See Also

- [Element Interaction](./element-interaction.md)
- [Authentication](./authentication.md)
- [Snapshot Refs](./snapshot-refs.md)
