# SocialDailyFlow — Daily Social Content for AIFlow (Example)

This example demonstrates a **single-agent AIFLOW project** that generates  
daily English social content for:

- X (Twitter) — short punchy post  
- LinkedIn — longer narrative post  

The content is **weekday-aware**: each day of the week has its own theme  
(e.g. Monday = AI concepts, Tuesday = debugging & traces, Friday = brand & story).

---

## 📦 Files in this folder

- `SocialDailyFlow_v1.0.0.aiflow`  
- This `README.md`

The `.aiflow` file is a self-contained AIFLOW project following the v0.1 standard.

---

## ▶️ Running this example using the CLI

From the repository root:

```bash
# Make sure dependencies are installed
npm install

# Set your Gemini API key (if not already set)
export API_KEY=YOUR_GEMINI_API_KEY
# or:
# export GEMINI_API_KEY=YOUR_GEMINI_API_KEY

# Run the SocialDailyFlow
npm run run-flow -- ./examples/SocialDailyFlow/SocialDailyFlow_v1.0.0.aiflow
