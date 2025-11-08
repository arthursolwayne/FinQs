#!/usr/bin/env python3
import json

# Read existing answers
with open('/home/user/FinQs/answers.json', 'r') as f:
    answers = json.load(f)

# Add new answers
new_answers = [
    {
        "question_number": 3,
        "question": "Did TJX beat or miss its Q4 FY 2025 pre-tax margin guidance? Express result as BPS difference",
        "answer": "FINAL ANSWER: TJX BEAT its Q4 FY 2025 pre-tax margin guidance by 70 basis points (bps). The company reported a pretax profit margin of 11.6%, which was above the high-end of its plan by 0.7 percentage points (70 bps). The beat was primarily driven by lower than expected inventory shrink expense and expense leverage on above-plan sales, partially offset by higher incentive compensation accruals.",
        "sources": [
            {
                "url": "https://investor.tjx.com/news-releases/news-release-details/tjx-companies-inc-reports-q4-and-fy25-results-q4-comp-store",
                "name": "TJX Q4 and FY25 Results Press Release (Feb 26, 2025)"
            }
        ]
    },
    {
        "question_number": 4,
        "question": "How large was the range (in % terms) for AMD's revenue guidance for Q2 2024, Q3 2024, Q4 2024, and Q1 2025?",
        "answer": "FINAL ANSWER: AMD's revenue guidance ranges in percentage terms of midpoint for each quarter:\n\nQ2 2024: $5.4 billion (low) to $6.0 billion (high), 10.5% of midpoint\n  - Midpoint: $5.7 billion\n  - Range: $600 million (±$300 million)\n  - % of midpoint: 10.5%\n\nQ3 2024: $6.4 billion (low) to $7.0 billion (high), 9.0% of midpoint\n  - Midpoint: $6.7 billion\n  - Range: $600 million (±$300 million)\n  - % of midpoint: 9.0%\n\nQ4 2024: $7.2 billion (low) to $7.8 billion (high), 8.0% of midpoint\n  - Midpoint: $7.5 billion\n  - Range: $600 million (±$300 million)\n  - % of midpoint: 8.0%\n\nQ1 2025: $6.8 billion (low) to $7.4 billion (high), 8.5% of midpoint\n  - Midpoint: $7.1 billion\n  - Range: $600 million (±$300 million)\n  - % of midpoint: 8.5%",
        "sources": [
            {
                "url": "https://ir.amd.com/news-events/press-releases/detail/1209/amd-reports-second-quarter-2024-financial-results",
                "name": "AMD Q2 2024 Financial Results"
            },
            {
                "url": "https://ir.amd.com/news-events/press-releases/detail/1224/amd-reports-third-quarter-2024-financial-results",
                "name": "AMD Q3 2024 Financial Results"
            },
            {
                "url": "https://ir.amd.com/news-events/press-releases/detail/1236/amd-reports-fourth-quarter-and-full-year-2024-financial-results",
                "name": "AMD Q4 2024 Financial Results"
            }
        ]
    },
    {
        "question_number": 5,
        "question": "In 2024, who was Nominated to Serve on BBSI's (NASDAQ: BBSI) Board of Directors?",
        "answer": "FINAL ANSWER: For BBSI's 2024 Annual Meeting held on June 3, 2024, eight directors were nominated to serve until the 2025 annual meeting of stockholders:\n\n1. Thomas J. Carley\n2. Joseph S. Clabby\n3. Thomas B. Cusick\n4. Gary E. Kramer\n5. Anthony Meeker\n6. Carla A. Moradi\n7. Alexandra Morehouse\n8. Vincent P. Price\n\nAll eight nominees were recommended by the Board of Directors for election. Additionally, in December 2024, BBSI established a Vice Chairman role and appointed current board member Joseph S. Clabby to this new position.",
        "sources": [
            {
                "url": "https://ir.bbsi.com/sec-filings/all-sec-filings/content/0000950170-24-046428/0000950170-24-046428.pdf",
                "name": "BBSI 2024 Proxy Statement"
            },
            {
                "url": "https://ir.bbsi.com/news-events/press-releases/detail/380/bbsi-establishes-vice-chairman-role-appoints-current-board",
                "name": "BBSI Vice Chairman Appointment Press Release (Dec 2024)"
            }
        ]
    },
    {
        "question_number": 6,
        "question": "Of AMZN, META, or GOOG, who plans to spend the most in capex in 2025?",
        "answer": "FINAL ANSWER: Amazon (AMZN) plans to spend the most in capex in 2025 with approximately $125 billion in capital expenditures.\n\nComparison of 2025 capex plans:\n1. Amazon (AMZN): ~$125 billion (highest)\n2. Google/Alphabet (GOOG): $85 billion (revised up from $75 billion)\n3. Meta (META): $70-72 billion (revised up from $66-72 billion)\n\nAmazon's $125 billion represents a significant increase from 2024's approximately $83 billion. This massive investment is primarily driven by AI infrastructure, data centers, and computing capacity to meet growing demand for cloud and AI services.",
        "sources": [
            {
                "url": "https://www.cnbc.com/2025/02/06/amazon-expects-to-spend-100-billion-on-capital-expenditures-in-2025.html",
                "name": "Amazon $100 billion capex 2025 - CNBC"
            },
            {
                "url": "https://sherwood.news/business/amazon-plans-100-billion-spend-on-ai-in-2025/",
                "name": "Amazon capex spending 2025 - Sherwood News"
            },
            {
                "url": "https://www.cnbc.com/2025/02/08/tech-megacaps-to-spend-more-than-300-billion-in-2025-to-win-in-ai.html",
                "name": "Tech megacaps $300 billion spending 2025 - CNBC"
            }
        ]
    },
    {
        "question_number": 7,
        "question": "Who is the current CFO of Airbnb (NASDAQ: ABNB)?",
        "answer": "FINAL ANSWER: Ellie Mertz is the current Chief Financial Officer (CFO) of Airbnb as of 2025. She was promoted to CFO effective March 1, 2024, replacing Dave Stephenson who transitioned to a newly created Chief Business Officer role. Mertz is an 11-year veteran of Airbnb and oversees the company's global finance team, including financial planning and analysis, accounting, tax, treasury, and investor relations. In June 2025, Mertz was also appointed to Netflix's Board of Directors, where she previously worked from 2006 to 2013 in various finance roles.",
        "sources": [
            {
                "url": "https://news.airbnb.com/airbnb-executive-team-update/",
                "name": "Airbnb Executive Team Update (Dec 2023)"
            },
            {
                "url": "https://investors.airbnb.com/governance/executive-management/executive-person-details/default.aspx?ItemId=aa922706-6706-4221-9858-de6bc268dce2",
                "name": "Airbnb Investor Relations - CFO Profile"
            },
            {
                "url": "https://ir.netflix.net/investor-news-and-events/financial-releases/press-release-details/2025/Ellie-Mertz-Appointed-to-Netflix-Board-of-Directors-2025-bYlhtQ6XSS/default.aspx",
                "name": "Ellie Mertz Appointed to Netflix Board (June 2025)"
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
