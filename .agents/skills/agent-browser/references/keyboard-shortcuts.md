# Keyboard Shortcuts & Input Simulation

This reference covers keyboard input simulation, hotkey combinations, and text entry patterns for browser automation with Playwright.

## Basic Key Press

Simulate a single key press on the focused element or page:

```typescript
// Press a single key
await page.keyboard.press('Enter');
await page.keyboard.press('Tab');
await page.keyboard.press('Escape');
await page.keyboard.press('ArrowDown');

// Press on a specific element
await page.locator('#search-input').press('Enter');
```

## Key Combinations (Hotkeys)

Use `+` to combine modifier keys with other keys:

```typescript
// Common shortcuts
await page.keyboard.press('Control+A');   // Select all
await page.keyboard.press('Control+C');   // Copy
await page.keyboard.press('Control+V');   // Paste
await page.keyboard.press('Control+Z');   // Undo
await page.keyboard.press('Control+Shift+Z'); // Redo
await page.keyboard.press('Control+F');   // Find
await page.keyboard.press('Control+L');   // Focus address bar

// Mac-specific (use Meta for Cmd key)
await page.keyboard.press('Meta+A');      // Cmd+A on macOS
await page.keyboard.press('Meta+Shift+P'); // Cmd+Shift+P

// Function keys
await page.keyboard.press('F5');          // Refresh
await page.keyboard.press('F12');         // DevTools
await page.keyboard.press('Alt+F4');      // Close window
```

## Typing Text

Type text character by character (triggers input events):

```typescript
// Type into focused element
await page.keyboard.type('Hello, World!');

// Type with delay between keystrokes (more human-like)
await page.keyboard.type('search query', { delay: 50 });

// Type into a specific element
await page.locator('#username').type('john.doe@example.com');
await page.locator('#password').type('SecurePass123');
```

## Fill vs Type

`fill()` sets the value directly (faster), `type()` simulates keystrokes:

```typescript
// fill() - sets value directly, triggers change event
await page.locator('#email').fill('user@example.com');

// type() - simulates actual keystrokes, triggers keydown/keyup/input events
await page.locator('#search').type('playwright automation');

// clear a field before typing
await page.locator('#input').fill('');
await page.locator('#input').type('new value');

// Select all and replace
await page.locator('#input').click();
await page.keyboard.press('Control+A');
await page.keyboard.type('replacement text');
```

## Key Down / Key Up (Hold Keys)

For actions requiring held keys (e.g., multi-select with Shift/Ctrl):

```typescript
// Hold Shift while clicking to multi-select
await page.keyboard.down('Shift');
await page.locator('.item:nth-child(3)').click();
await page.locator('.item:nth-child(7)').click();
await page.keyboard.up('Shift');

// Hold Ctrl for multi-select
await page.keyboard.down('Control');
await page.locator('.checkbox-item').nth(0).click();
await page.locator('.checkbox-item').nth(2).click();
await page.locator('.checkbox-item').nth(4).click();
await page.keyboard.up('Control');
```

## Special Keys Reference

| Key Name | Description |
|---|---|
| `Enter` | Enter/Return |
| `Tab` | Tab |
| `Escape` | Escape |
| `Backspace` | Backspace |
| `Delete` | Delete |
| `Space` | Spacebar |
| `ArrowUp` | Up arrow |
| `ArrowDown` | Down arrow |
| `ArrowLeft` | Left arrow |
| `ArrowRight` | Right arrow |
| `Home` | Home |
| `End` | End |
| `PageUp` | Page Up |
| `PageDown` | Page Down |
| `Control` | Ctrl modifier |
| `Shift` | Shift modifier |
| `Alt` | Alt modifier |
| `Meta` | Cmd (macOS) / Win (Windows) |
| `F1`–`F12` | Function keys |

## Clipboard Operations

```typescript
// Copy text from element
await page.locator('#output').click();
await page.keyboard.press('Control+A');
await page.keyboard.press('Control+C');

// Read clipboard content (requires permissions)
const clipboardText = await page.evaluate(() => navigator.clipboard.readText());

// Write to clipboard and paste
await page.evaluate((text) => navigator.clipboard.writeText(text), 'pasted content');
await page.locator('#target').click();
await page.keyboard.press('Control+V');
```

## Navigation Shortcuts

```typescript
// Browser navigation
await page.keyboard.press('Alt+ArrowLeft');  // Back
await page.keyboard.press('Alt+ArrowRight'); // Forward
await page.keyboard.press('Control+R');      // Reload
await page.keyboard.press('Control+T');      // New tab (may not work in headless)

// Page navigation
await page.keyboard.press('Space');          // Scroll down
await page.keyboard.press('Shift+Space');    // Scroll up
await page.keyboard.press('Control+Home');   // Jump to top
await page.keyboard.press('Control+End');    // Jump to bottom
```

## Accessibility & Focus Management

```typescript
// Tab through focusable elements
for (let i = 0; i < 5; i++) {
  await page.keyboard.press('Tab');
}

// Reverse tab order
await page.keyboard.press('Shift+Tab');

// Activate focused element (button, link, etc.)
await page.keyboard.press('Enter');
await page.keyboard.press('Space'); // Checkboxes, buttons

// Check which element is focused
const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
console.log('Focused element:', focusedElement);
```

## Common Patterns

### Search and Submit
```typescript
await page.locator('#search').fill('open agents');
await page.keyboard.press('Enter');
```

### Dropdown Navigation
```typescript
await page.locator('select#country').focus();
await page.keyboard.press('ArrowDown'); // Move to next option
await page.keyboard.type('Un');         // Jump to options starting with 'Un'
await page.keyboard.press('Enter');     // Confirm selection
```

### Rich Text Editor
```typescript
await page.locator('.editor').click();
await page.keyboard.press('Control+A');        // Select all
await page.keyboard.press('Control+B');        // Bold
await page.keyboard.type('Bold text here');
await page.keyboard.press('End');             // Move to end of line
await page.keyboard.press('Enter');           // New line
await page.keyboard.press('Control+I');       // Italic
await page.keyboard.type('Italic text here');
```
