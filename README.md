# Finance Agent Evaluation

This repository contains a set of 50 finance-related questions for evaluation, along with tools to help answer them.

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

You have access to the following Python tools in `tools.py`:

### 1. `google_web_search(query: str) -> dict`
Searches the web using Google via SerpAPI.
- **Parameters**: `query` - The search query string
- **Returns**: Dictionary with search results

### 2. `edgar_search(query: str) -> dict`
Searches SEC EDGAR database for company filings.
- **Parameters**: `query` - Search query (company name, ticker, or keywords)
- **Returns**: Dictionary with SEC filing results

### 3. `parse_html_page(url: str) -> str`
Fetches and parses HTML content from a URL, extracting clean text.
- **Parameters**: `url` - The URL to fetch and parse
- **Returns**: Cleaned text content from the page

### 4. `retrieve_information(query: str, data_store: list) -> str`
Uses LLM to retrieve relevant information from previously collected data.
- **Parameters**:
  - `query` - What information to retrieve
  - `data_store` - List of data sources to search through
- **Returns**: Retrieved information as text

## Setup

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Create a `.env` file with your API keys:
```
# LLM API Keys (only set the ones you plan to use)
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_anthropic_key
GOOGLE_API_KEY=your_google_key

# Tool API Keys (required)
SERP_API_KEY=your_serpapi_key
SEC_API_KEY=your_sec_api_key
```

Get API keys:
- SerpAPI: https://serpapi.com/
- SEC API: https://sec-api.io/

## Usage

The tools are implemented in `tools.py`. You can import and use them in your own code:

```python
from tools import google_web_search, edgar_search, parse_html_page, retrieve_information

# Search the web
results = google_web_search("Apple revenue 2024")

# Search SEC filings
filings = edgar_search("AAPL 10-K")

# Parse a webpage
content = parse_html_page("https://example.com")

# Retrieve information from collected data
answer = retrieve_information("What was the revenue?", data_store)
```

The `llm.py` module provides LLM client functionality if you need to call language models directly.
