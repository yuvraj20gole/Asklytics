Fix misleading dual-axis chart where two metrics with very different magnitudes (e.g., Revenue vs Expenses) appear visually similar.

---

# PROBLEM

Currently:

* Revenue (~400,000+) and Expenses (~6,000) are plotted together
* Using dual Y-axes (left + right)
* Right axis is hidden
* Result: both lines overlap and look similar ❌

This is misleading and not acceptable for financial dashboards.

---

# GOAL

Make the chart accurate, readable, and professional.

---

# OPTION 1 (PRIMARY FIX — SINGLE AXIS)

Use ONLY one Y-axis so values reflect true scale.

### CHANGE THIS:

```jsx
<Line yAxisId="left" dataKey="revenue" />
<Line yAxisId="right" dataKey="expenses" />
```

---

### TO:

```jsx
<YAxis />

<Line dataKey="revenue" stroke="#22c55e" name="Revenue" />
<Line dataKey="expenses" stroke="#3b82f6" name="Expenses" />
```

---

# RESULT

* Revenue shows correct trend
* Expenses appears small (which is TRUE)
* No misleading scaling

---

# OPTION 2 (ALTERNATIVE — SEPARATE CHARTS)

Split into two charts:

### Chart 1:

```jsx
<LineChart data={data}>
  <YAxis />
  <Line dataKey="revenue" />
</LineChart>
```

### Chart 2:

```jsx
<LineChart data={data}>
  <YAxis />
  <Line dataKey="expenses" />
</LineChart>
```

---

# OPTION 3 (ADVANCED — LOG SCALE)

If both must be visible:

```jsx
<YAxis scale="log" domain={['auto', 'auto']} />
```

---

# OPTIONAL (IF KEEPING DUAL AXIS)

Make it honest:

```jsx
<YAxis yAxisId="left" label={{ value: "Revenue (₹)" }} />
<YAxis yAxisId="right" orientation="right" label={{ value: "Expenses (₹)" }} />
```

DO NOT hide the right axis.

---

# BONUS (UX IMPROVEMENT)

Add toggle:

* Compare Mode (same chart)
* Separate Mode (2 charts)

---

# DO NOT DO

❌ Do not hide second axis
❌ Do not scale independently without labeling
❌ Do not make small values look large

---

# GOAL

Ensure financial charts represent real magnitude differences clearly and professionally.
