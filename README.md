# Finance Agent Evaluation

This repository contains a set of 50 finance-related questions for evaluation.

## Task

You are a financial agent. Today is November 07, 2025. Answer all 50 questions in `data/questions.csv` using the tools provided.

For each question:
- Use the available tools to research and find accurate answers
- When you have the answer, format it as `FINAL ANSWER:` followed by your answer
- Provide sources in this format:
```json
{
    "sources": [
        {
            "url": "https://example.com",
            "name": "Name of the source"
        }
    ]
}
```

Save all answers in a structured format (CSV/JSON) for later scoring.

## Questions

The evaluation questions are located in `data/questions.csv`. Each row contains a single question about financial data, SEC filings, or company analysis.

## Available Tools

### Built-in Claude Code Web Tools
Use these tools that are already available to you:
- **WebSearch** - Search the web for information (no API key needed)
- **WebFetch** - Fetch and parse HTML content from URLs (no API key needed)

### Custom Tool: SEC EDGAR Search

For searching SEC filings, use the `edgar_search` function from `tools.py`:

```python
from tools import edgar_search

# Example usage
results = await edgar_search(
    query="revenue guidance",
    form_types=["10-K", "10-Q"],  # Optional: filter by form type
    ciks=["0000320193"],          # Optional: filter by company CIK
    start_date="2024-01-01",      # Optional: start date (yyyy-mm-dd)
    end_date="2024-12-31",        # Optional: end date (yyyy-mm-dd)
    top_n_results=10              # Optional: max results to return
)
```

**Parameters:**
- `query` (required): Search keywords or phrase
- `form_types` (optional): List of SEC form types like `['10-K', '10-Q', '8-K']`
- `ciks` (optional): List of company CIK numbers
- `start_date` (optional): Start date in `yyyy-mm-dd` format
- `end_date` (optional): End date in `yyyy-mm-dd` format
- `page` (optional): Page number for pagination (default: 1)
- `top_n_results` (optional): Number of results to return (default: 10)

**Returns:** List of dictionaries containing filing metadata (title, URL, filing date, form type, etc.)

**Note:** The SEC API key is already configured in the code.

## Setup

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. No environment variables or API keys needed - everything is pre-configured!

## Example Workflow

1. Read questions from `data/questions.csv`
2. For each question:
   - Use **WebSearch** to find general information
   - Use **edgar_search** to search SEC filings
   - Use **WebFetch** to fetch and parse HTML pages
   - Extract the answer from the collected data
   - Format as `FINAL ANSWER: ...` with sources
3. Save all answers to a file (CSV/JSON)
