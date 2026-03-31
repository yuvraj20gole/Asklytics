Design a modern, professional, and visually appealing web UI for an AI-powered Business Chatbot (Text-to-SQL Assistant).

PROJECT DESCRIPTION:
This system allows users to ask business-related questions in natural language. The AI converts the question into SQL queries, executes them on a database, and displays results in tables and visualizations. The system acts as a cost-effective alternative to expensive analytics tools.

-------------------------------------

THEME & STYLE:
- Style: Minimal, futuristic, AI-powered SaaS dashboard
- Mode: Dark theme
- Primary color: #0f172a (dark background)
- Accent color: #6366f1 (indigo)
- Secondary color: #22c55e (green for success)
- Error color: #ef4444 (red)
- Typography: Inter / Poppins
- UI Feel: Mix of ChatGPT + modern analytics dashboard (clean, spacious, premium)

Design guidelines:
- Rounded cards (border-radius 12–16px)
- Soft shadows
- Consistent spacing
- Smooth layout hierarchy
- Use icons (lucide or similar)
- Keep it clean and professional

-------------------------------------

PAGES TO DESIGN:

1. LANDING PAGE
- Simple hero section
- Title: “AI Business Analyst”
- Subtitle explaining natural language to SQL
- Buttons: Login, Register
- Clean, centered layout with AI-themed visuals

-------------------------------------

2. REGISTER PAGE
Centered card layout:
- Fields:
  • Company Email ID
  • Username
  • Password
  • Confirm Password
- Register button
- Link: “Already have an account? Login”
- Show validation states (error/success)
- After register → redirect to login

-------------------------------------

3. LOGIN PAGE
Centered card layout:
- Fields:
  • Email / User ID
  • Password
- Login button
- Link: “Don’t have an account? Register”
- Error message UI
- After login → redirect to dashboard

-------------------------------------

4. DASHBOARD (HOME PAGE)

Navbar:
- Logo (AI Analyst)
- Menu: Dashboard, Chat, History, Analytics, Settings
- User profile icon

Main dashboard cards (4 cards):
- Total Queries Executed
- Total Sales
- Active Users
- Error Rate

Additional section:
- Recent Queries (list view)
- System Status (active/healthy indicator)

-------------------------------------

5. CHAT INTERFACE (MAIN FEATURE)

Layout:
- Center chat panel
- Sidebar optional for history

Components:
- Chat messages (user + AI)
- Input box at bottom
- Send button

AI response should display in cards:
1. Generated SQL Query (code block style)
2. Result Table (structured data)
3. Visualization (chart area – bar/line)

-------------------------------------

6. HISTORY PAGE
- List of past queries
- Each item shows:
  • Query text
  • Timestamp
  • Short preview
- Click to reopen query

-------------------------------------

7. ANALYTICS PAGE
- Charts:
  • Bar chart (sales)
  • Line chart (trends)
  • Pie chart (distribution)
- Clean grid layout
- Filters (date range optional)

-------------------------------------

8. SETTINGS PAGE (Optional but good)
- User profile
- Change password
- Theme toggle (optional)

-------------------------------------

CARD STRUCTURE:
Total cards should include:
- 2 Auth cards (Login, Register)
- 4 Dashboard cards
- 3 Chat output cards (SQL, Table, Chart)
- Optional: History + System status

Total: 9–11 cards

-------------------------------------

USER FLOW:

Landing Page
→ Register / Login
→ Authentication
→ Dashboard
→ Chat Interface (ask query)
→ AI converts text to SQL
→ Database returns result
→ Display results + charts
→ Save in history
→ View in analytics

-------------------------------------

FINAL OUTPUT REQUIREMENTS:
- Clean layout with proper spacing
- Professional SaaS look
- Consistent design system
- Ready for frontend development (React / Tailwind friendly)