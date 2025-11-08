#!/usr/bin/env python3
import json

# Read existing answers
with open('/home/user/FinQs/answers.json', 'r') as f:
    answers = json.load(f)

# Add new answers from research
new_answers = [
    {
        "question_number": 14,
        "question": "Approximate Zillow's Free Cash Flow as CFO - Capex. What is the trend of FCF margin over the last 3 years?",
        "answer": "FINAL ANSWER: Zillow's Free Cash Flow (approximated as Operating Cash Flow minus Capital Expenditures) over the last 3 years:\n\n**2024 (Full Year):**\n- Operating Cash Flow: $428M\n- Capital Expenditures: ~$143M (estimated)\n- Free Cash Flow: $285M\n- FCF Margin: 12.72% (FCF/Revenue of $2.24B)\n\n**2023 (Full Year):**\n- Operating Cash Flow: $354M\n- Free Cash Flow: $219M\n- Revenue: $1.95B\n- FCF Margin: ~11.2%\n\n**2022 (Full Year):**\n- Operating Cash Flow: $4,504M\n- Capital Expenditures: $165M\n- Free Cash Flow: $4,389M\n- Revenue: $1.96B\n- FCF Margin: ~224% (anomaly due to Zillow Offers wind-down)\n\n**Trend Analysis:**\nThe 2022 FCF was artificially inflated due to the one-time wind-down of Zillow Offers, which generated massive cash inflows from inventory liquidation. Excluding this anomaly, the normalized trend from 2023 to 2024 shows healthy improvement:\n- FCF increased from $219M (2023) to $285M (2024), representing ~30% growth\n- FCF margin improved from ~11.2% (2023) to 12.72% (2024)\n- The company successfully transitioned from the 2022 iBuying exit to sustainable, growing cash generation with improving margins in 2023-2024.",
        "sources": [
            {
                "url": "https://stockanalysis.com/stocks/z/financials/cash-flow-statement/",
                "name": "Zillow Group Cash Flow Statement"
            },
            {
                "url": "https://investors.zillowgroup.com/investors/news-and-events/news/news-details/2025/Zillow-Group-Reports-Fourth-Quarter-and-Full-Year-2024-Financial-Results/default.aspx",
                "name": "Zillow Group Q4 and Full Year 2024 Financial Results"
            }
        ]
    },
    {
        "question_number": 34,
        "question": "In fiscal 2024, what percentage of Cloudflare's (NYSE: NET) revenue were derived from channel partners?",
        "answer": "FINAL ANSWER: Based on available quarterly data for fiscal year 2024, channel partner revenue ranged from 19% to 22% of total revenue throughout the year.\n\nQuarterly breakdown:\n- Q1 2024: Channel partners contributed 19% of revenue, while direct customers accounted for 81%\n- Q4 2024: Channel partners contributed 22% of revenue ($101.4M), while direct customers accounted for 78% ($358.6M)\n\nThe data shows channel partner revenue grew throughout fiscal 2024, increasing from 19% in Q1 to 22% in Q4, indicating growth in the channel partner segment. Cloudflare's Channel and Alliance business revenue accelerated 174% over two years (2022-2024), with the program earning 5-stars from CRN in 2024.\n\nNote: While quarterly data is available, the specific full fiscal year 2024 blended percentage was not explicitly stated in the 10-K filing. The range suggests approximately 20-21% for the full year based on the quarterly trend.",
        "sources": [
            {
                "url": "https://www.cloudflare.com/en-in/press/press-releases/2024/cloudflare-channel-and-alliance-business-revenue-accelerates-174-over-two/",
                "name": "Cloudflare Channel Business Revenue Growth (2024)"
            },
            {
                "url": "https://www.sec.gov/Archives/edgar/data/1477333/000147733325000043/cloud-20241231.htm",
                "name": "Cloudflare 10-K for fiscal year ended December 31, 2024"
            }
        ]
    },
    {
        "question_number": 39,
        "question": "What financial metrics does Delta Airlines (NYSE: DAL) guide on in its quarterly earnings reports?",
        "answer": "FINAL ANSWER: Delta Air Lines guides on the following financial metrics in its quarterly earnings reports:\n\n1. **Revenue Growth** - Year-over-year percentage change in total revenue\n   Example: March Q 2025 guidance of 7% to 9% revenue growth\n\n2. **Operating Margin** - Operating income as a percentage of revenue\n   Example: March Q 2025 guidance of 6% to 8% operating margin\n\n3. **Adjusted Earnings Per Share (EPS)** - Diluted earnings per share on an adjusted basis\n   Example: March Q 2025 guidance of $0.70 to $1.00 per share\n\n4. **Free Cash Flow (Annual)** - Operating cash flow minus capital expenditures\n   Example: Full year 2025 guidance of more than $4 billion in free cash flow\n\n5. **Pre-tax Income (Annual)** - Income before taxes\n   Example: Full year 2025 guidance of greater than $6 billion\n\nDelta provides quarterly guidance for revenue growth, operating margin, and adjusted EPS, while free cash flow and pre-tax income guidance are typically provided on an annual basis. All guidance metrics are presented as ranges or minimum thresholds rather than point estimates.",
        "sources": [
            {
                "url": "https://ir.delta.com/news/news-details/2025/Delta-Air-Lines-Announces-December-Quarter-and-Full-Year-2024-Financial-Results/default.aspx",
                "name": "Delta Q4 and Full Year 2024 Results with Q1 2025 Guidance"
            },
            {
                "url": "https://www.prnewswire.com/news-releases/delta-air-lines-announces-december-quarter-and-full-year-2024-financial-results-302347891.html",
                "name": "Delta December Quarter and Full Year 2024 Financial Results"
            }
        ]
    }
]

# Add new answers
answers.extend(new_answers)

# Save updated answers
with open('/home/user/FinQs/answers.json', 'w') as f:
    json.dump(answers, f, indent=2)

print(f"Added {len(new_answers)} new answers. Total answers: {len(answers)}")
