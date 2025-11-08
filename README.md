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

---

# Evaluation Results

**Evaluation Date**: November 8, 2025
**Branch Evaluated**: `claude/do-you-see-011CUukfSGVrfoj1mrDzoztA`
**Methodology**: Automated rubric-based grading against ground truth

## Executive Summary

The financial research agent answered **46 out of 50 questions** (92% completion rate) with an **average score of 78.6/100**. The agent demonstrated exceptional performance on **Trends** questions (100%) and strong capabilities in **Complex Retrieval** (93.9%) and **Quantitative Retrieval** (88.9%). Areas needing improvement include **Market Analysis** (36.1%) and **Financial Modeling** (70%).

## Overall Performance

| Metric | Value |
|--------|-------|
| Total Questions | 50 |
| Questions Answered | 46 (92.0%) |
| Questions Skipped | 4 (8.0%) |
| Average Score | **78.6/100** |
| Perfect Scores (100/100) | 31 questions (62%) |
| Failing Scores (0/100) | 7 questions (14%) |

## Performance by Difficulty

| Difficulty Level | Average Score | Analysis |
|-----------------|---------------|----------|
| **Easy** | 84.1/100 | Strong performance, but 3 skipped questions lowered average |
| **Medium** | 87.8/100 | Best category - consistent high scores |
| **Hard** | 51.5/100 | ⚠️ Significant weakness - several failures and skips |
| **Very Hard** | 80.9/100 | Surprisingly strong given complexity |

**Key Insight**: Hard questions (not Very Hard) present the biggest challenge, suggesting gaps in specific topic areas rather than overall complexity handling.

## Performance by Question Type

| Question Type | Average Score | Question Count | Grade |
|--------------|---------------|----------------|-------|
| **Trends** | 100.0/100 | 3 | A+ ✅ |
| **Complex Retrieval** | 93.9/100 | 6 | A |
| **Quantitative Retrieval** | 88.9/100 | 5 | A |
| **Adjustments** | 83.9/100 | 4 | B+ |
| **Qualitative Retrieval** | 80.8/100 | 7 | B |
| **Beat or Miss** | 76.0/100 | 7 | C+ |
| **Numerical Reasoning** | 70.8/100 | 8 | C |
| **Financial Modeling** | 70.0/100 | 4 | C |
| **Market Analysis** | 36.1/100 | 3 | F ⚠️ |

## Strengths

### 1. Perfect Execution on Trends Analysis
- **100% score** across all 3 trend questions
- Examples: Netflix ARPU trends, Zillow FCF margin trends, Airbnb take rate trends
- Demonstrates strong ability to track metrics over time and identify patterns

### 2. Excellent Complex Information Retrieval
- **93.9% average** on complex retrieval tasks
- Successfully navigated multi-part questions requiring synthesis from multiple sources
- Strong performance on questions requiring SEC filing analysis

### 3. High-Quality Sources
- **73.9% of answers** used "Good" quality sources
- Strong preference for authoritative sources (SEC filings, investor relations)
- **Zero answers** rated as having "Poor" sources

### 4. Quantitative Accuracy
- **88.9% score** on quantitative retrieval
- Precise extraction of numbers from financial documents
- Accurate formatting and presentation of numerical data

## Weaknesses

### 1. Market Analysis (Critical Weakness) ⚠️
- **36.1% average** - lowest performing category
- **1 of 3 questions failed** (0 score)
- **1 of 3 questions** scored only 33.3%
- **Issue**: Difficulty synthesizing qualitative business impacts and strategic implications

### 2. Hard Difficulty Questions
- **51.5% average** on "Hard" questions
- Higher skip rate and failure rate than other difficulty levels
- Suggests need for better handling of multi-step research tasks

### 3. Skipped Questions
Four questions were completely skipped:
- Q15: Zillow FCF approximation (Easy, Numerical Reasoning)
- Q19: Workday retention metric (Easy, Qualitative Retrieval)
- Q21: ORCL effective tax rate (Easy, Numerical Reasoning)
- Q50: General Mills guidance beat/miss (Hard, Beat or Miss)

**Concern**: Three "Easy" questions were skipped, indicating possible data access issues rather than complexity.

### 4. Numerical Reasoning
- **70.8% average** - surprisingly low for this fundamental skill
- 3 questions skipped, 2 questions with scores below 70%
- May indicate challenges with multi-step calculations or finding the right data points

## Source Quality Analysis

| Quality Rating | Count | Percentage | Notes |
|---------------|-------|------------|-------|
| **Good** | 34 | 73.9% | SEC filings, investor relations, official press releases |
| **Acceptable** | 12 | 26.1% | News sites, industry publications, verified sources |
| **Poor** | 0 | 0% | No answers used unreliable sources |

**Strength**: Consistent use of authoritative, primary sources demonstrates strong research methodology.

## Recommendations

### Immediate Priorities

1. **Investigate Skipped Easy Questions** - Q15, Q19, Q21 are rated "Easy" but were skipped
2. **Improve Market Analysis Capability** - Average of 36.1% is unacceptable for professional financial analysis
3. **Strengthen Multi-Step Numerical Reasoning** - Several calculation-based questions scored poorly

### Strategic Improvements

4. **Enhance "Hard" Question Performance** - Develop better strategies for complex multi-part questions
5. **Improve Rubric Alignment** - Some answers were comprehensive but missed specific rubric points
6. **Maintain Source Quality** - Current source quality is excellent - maintain this standard

## Overall Grade: B- (78.6/100)

**Conclusion**: The financial research agent demonstrates strong core competencies in data retrieval, quantitative analysis, and trend identification. The agent excels at structured data extraction and shows excellent judgment in source selection. However, critical gaps exist in Market Analysis and challenges persist with Hard difficulty questions.

With targeted improvements in Market Analysis and numerical reasoning, this agent has the potential to achieve 85%+ average scores.

---

## Files

- **`grading_results.json`** - Complete machine-readable results with detailed rubric scoring for all 50 questions
- **`GRADING_REPORT.md`** - Comprehensive analysis and recommendations
- **`grade_answers.py`** - Automated grading script for future evaluations
