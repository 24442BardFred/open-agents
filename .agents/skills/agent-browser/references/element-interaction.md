# Element Interaction Reference

This reference covers how to interact with page elements using the agent-browser skill, including clicking, typing, selecting, and waiting for elements.

## Overview

Element interaction is the core of browser automation. The agent-browser skill provides a set of actions to interact with DOM elements using Playwright's locator API under the hood.

## Locator Strategies

### By Text Content
```bash
# Click element containing specific text
browser_action click --selector "text=Submit"
browser_action click --selector "text=Sign In"
```

### By Role
```bash
# ARIA role-based selection (preferred for accessibility)
browser_action click --selector "role=button[name='Submit']"
browser_action click --selector "role=link[name='Home']"
browser_action click --selector "role=textbox[name='Email']"
```

### By CSS Selector
```bash
browser_action click --selector "#submit-btn"
browser_action click --selector ".nav-link.active"
browser_action click --selector "form > button[type='submit']"
```

### By Test ID
```bash
# Recommended for stable automation
browser_action click --selector "data-testid=login-button"
browser_action fill --selector "data-testid=email-input" --value "user@example.com"
```

### By XPath
```bash
browser_action click --selector "xpath=//button[contains(@class, 'primary')]"
```

## Click Actions

### Single Click
```bash
browser_action click --selector "#submit-btn"
```

### Double Click
```bash
browser_action dblclick --selector ".editable-cell"
```

### Right Click (Context Menu)
```bash
browser_action rightclick --selector ".file-item"
```

### Click with Modifiers
```bash
# Ctrl+Click for multi-select
browser_action click --selector ".list-item" --modifiers "Control"

# Shift+Click for range select
browser_action click --selector ".list-item:nth-child(5)" --modifiers "Shift"
```

### Click at Coordinates
```bash
browser_action click --x 320 --y 240
```

## Keyboard & Input Actions

### Fill Input Field
```bash
# Clears existing value and types new value
browser_action fill --selector "#username" --value "john_doe"
browser_action fill --selector "input[type='email']" --value "user@example.com"
browser_action fill --selector "textarea#bio" --value "Hello, I am a developer."
```

### Type (character by character)
```bash
# Simulates real keystroke events, useful for inputs with event listeners
browser_action type --selector "#search" --value "open agents" --delay 50
```

### Press Key
```bash
browser_action press --selector "#search" --key "Enter"
browser_action press --selector "body" --key "Escape"
browser_action press --selector "#editor" --key "Control+a"
browser_action press --selector "#editor" --key "Control+c"
```

### Clear Input
```bash
browser_action clear --selector "#username"
```

## Select & Checkbox Actions

### Select Dropdown Option
```bash
# By visible text
browser_action select --selector "#country" --value "United States"

# By option value attribute
browser_action select --selector "select[name='role']" --value "admin"

# Multiple select
browser_action select --selector "#tags" --value "javascript" --value "typescript"
```

### Check / Uncheck Checkbox
```bash
browser_action check --selector "#terms-checkbox"
browser_action uncheck --selector "#newsletter-opt-out"
browser_action setChecked --selector "#remember-me" --checked true
```

## Hover & Focus

### Hover Over Element
```bash
# Useful for triggering tooltips or dropdown menus
browser_action hover --selector ".dropdown-trigger"
browser_action hover --selector "nav > ul > li:first-child"
```

### Focus Element
```bash
browser_action focus --selector "#email-input"
```

## Waiting for Elements

### Wait for Element to Appear
```bash
browser_action waitForSelector --selector "#result-table" --state visible
browser_action waitForSelector --selector ".loading-spinner" --state hidden
```

### Wait for Element to be Enabled
```bash
browser_action waitForSelector --selector "button#submit" --state enabled
```

### Wait with Timeout
```bash
# Default timeout is 30000ms (30s)
browser_action waitForSelector --selector "#dynamic-content" --timeout 10000
```

## Scrolling

### Scroll Element into View
```bash
browser_action scrollIntoView --selector "#footer"
```

### Scroll Page
```bash
browser_action scroll --direction down --amount 500
browser_action scroll --direction up --amount 300
browser_action scroll --selector ".scrollable-list" --direction down --amount 200
```

## File Upload

```bash
# Set files on a file input element
browser_action setInputFiles --selector "input[type='file']" --files "/path/to/file.pdf"

# Multiple files
browser_action setInputFiles --selector "#multi-upload" --files "/path/a.png" --files "/path/b.png"
```

## Drag and Drop

```bash
# Drag from source to target
browser_action dragAndDrop --source "#draggable-item" --target "#drop-zone"

# Drag by offset
browser_action drag --selector "#slider-handle" --offsetX 100 --offsetY 0
```

## Reading Element State

### Get Text Content
```bash
browser_action getText --selector "h1.page-title"
browser_action getText --selector ".error-message"
```

### Get Input Value
```bash
browser_action getValue --selector "#username"
```

### Get Attribute
```bash
browser_action getAttribute --selector "a.download-link" --attribute "href"
browser_action getAttribute --selector "img.logo" --attribute "alt"
```

### Check Visibility
```bash
browser_action isVisible --selector "#modal-overlay"
browser_action isEnabled --selector "button#submit"
browser_action isChecked --selector "#terms-checkbox"
```

## Common Patterns

### Login Form Interaction
```bash
browser_action fill --selector "#email" --value "$USER_EMAIL"
browser_action fill --selector "#password" --value "$USER_PASSWORD"
browser_action click --selector "button[type='submit']"
browser_action waitForSelector --selector ".dashboard" --state visible
```

### Handling Modals
```bash
# Wait for modal, interact, then close
browser_action waitForSelector --selector ".modal" --state visible
browser_action fill --selector ".modal input[name='reason']" --value "Test reason"
browser_action click --selector ".modal button.confirm"
browser_action waitForSelector --selector ".modal" --state hidden
```

### Infinite Scroll
```bash
# Scroll to bottom repeatedly to load more content
browser_action scroll --direction down --amount 9999
browser_action waitForSelector --selector ".load-more-spinner" --state hidden
browser_action scroll --direction down --amount 9999
```

## Error Handling

- **Element not found**: Ensure selector is correct and element exists in DOM. Use `waitForSelector` before interacting.
- **Element not interactable**: Element may be hidden or disabled. Check visibility and enabled state first.
- **Timeout exceeded**: Increase `--timeout` value or check if page has loaded correctly.
- **Strict mode violation**: Multiple elements match the selector. Use a more specific selector.

## Notes

- Prefer role-based and test-id selectors for stability over CSS class selectors
- Use `fill` for form inputs instead of `type` unless testing keystroke events
- Always `waitForSelector` before interacting with dynamically loaded content
- Combine with snapshot references (see `snapshot-refs.md`) for visual verification after interactions
