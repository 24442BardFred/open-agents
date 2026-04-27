# Data Extraction Reference

This reference covers techniques for extracting structured data from web pages using the agent-browser skill, including text content, attributes, tables, and dynamic content.

## Overview

Data extraction allows you to capture information from web pages in a structured format. The agent-browser skill supports multiple extraction strategies depending on the content type and page structure.

## Basic Text Extraction

### Extract Inner Text

```bash
# Extract text content from a specific element
curl -X POST "$BROWSER_API_URL/sessions/$SESSION_ID/extract" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "selector": "h1.page-title",
    "property": "innerText"
  }'
```

### Extract Multiple Elements

```bash
# Extract text from all matching elements
curl -X POST "$BROWSER_API_URL/sessions/$SESSION_ID/extract-all" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "selector": "ul.results li",
    "property": "innerText"
  }'
```

**Response:**
```json
{
  "values": [
    "Result item one",
    "Result item two",
    "Result item three"
  ],
  "count": 3
}
```

## Attribute Extraction

### Extract HTML Attributes

```bash
# Extract href from all anchor tags
curl -X POST "$BROWSER_API_URL/sessions/$SESSION_ID/extract-all" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "selector": "a.product-link",
    "attribute": "href"
  }'
```

### Extract Data Attributes

```bash
# Extract data-id attributes for tracking
curl -X POST "$BROWSER_API_URL/sessions/$SESSION_ID/extract-all" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "selector": "[data-product-id]",
    "attribute": "data-product-id"
  }'
```

## Table Data Extraction

### Extract Entire Table

```bash
# Extract a full HTML table as structured JSON
curl -X POST "$BROWSER_API_URL/sessions/$SESSION_ID/extract-table" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "selector": "table#data-table",
    "includeHeaders": true
  }'
```

**Response:**
```json
{
  "headers": ["Name", "Price", "Stock"],
  "rows": [
    ["Widget A", "$9.99", "In Stock"],
    ["Widget B", "$14.99", "Out of Stock"]
  ]
}
```

## Structured Data Extraction

### Extract Multiple Fields at Once

```bash
# Extract multiple fields from a product page
curl -X POST "$BROWSER_API_URL/sessions/$SESSION_ID/extract-structured" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "fields": {
      "title": { "selector": "h1.product-title", "property": "innerText" },
      "price": { "selector": ".price-current", "property": "innerText" },
      "rating": { "selector": ".star-rating", "attribute": "aria-label" },
      "imageUrl": { "selector": "img.product-image", "attribute": "src" },
      "inStock": { "selector": ".stock-status", "property": "innerText" }
    }
  }'
```

**Response:**
```json
{
  "title": "Premium Wireless Headphones",
  "price": "$79.99",
  "rating": "4.5 out of 5 stars",
  "imageUrl": "https://example.com/images/headphones.jpg",
  "inStock": "In Stock"
}
```

## Dynamic Content Extraction

### Wait for Content Before Extracting

```bash
# Wait for dynamic content to load, then extract
curl -X POST "$BROWSER_API_URL/sessions/$SESSION_ID/extract" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "selector": ".dynamic-results",
    "property": "innerHTML",
    "waitFor": {
      "selector": ".dynamic-results .item",
      "timeout": 5000
    }
  }'
```

### Extract After Interaction

```bash
# Click a button to load more items, then extract
curl -X POST "$BROWSER_API_URL/sessions/$SESSION_ID/click" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "selector": "button#load-more" }'

# Wait and extract newly loaded items
curl -X POST "$BROWSER_API_URL/sessions/$SESSION_ID/extract-all" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "selector": ".item-list .item",
    "property": "innerText",
    "waitFor": { "selector": ".item-list .item:nth-child(21)", "timeout": 3000 }
  }'
```

## JSON-LD and Meta Extraction

### Extract Structured Metadata

```bash
# Extract JSON-LD structured data from the page
curl -X POST "$BROWSER_API_URL/sessions/$SESSION_ID/extract-metadata" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "types": ["json-ld", "og", "twitter-card"]
  }'
```

## Error Handling

| Error Code | Description | Resolution |
|------------|-------------|------------|
| `SELECTOR_NOT_FOUND` | No element matches the selector | Verify selector or add a `waitFor` condition |
| `PROPERTY_UNAVAILABLE` | Property does not exist on element | Use `attribute` instead of `property` |
| `EXTRACTION_TIMEOUT` | Element did not appear within timeout | Increase `waitFor.timeout` value |
| `INVALID_TABLE` | Target element is not a table | Use `extract` or `extract-all` instead |

## Best Practices

- **Use specific selectors**: Prefer IDs and unique class names over generic tags to avoid extracting unintended content.
- **Validate extracted data**: Always check that extracted values are non-empty before using them downstream.
- **Handle pagination**: For paginated content, iterate through pages and aggregate results.
- **Respect rate limits**: Add delays between extraction requests to avoid overloading target servers.
- **Use `waitFor` for SPAs**: Single-page applications render content asynchronously; always wait for target elements before extracting.
