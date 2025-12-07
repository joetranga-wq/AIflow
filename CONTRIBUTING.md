# Contributing to AIFLOW

First of all: thank you for your interest in contributing! ❤️

AIFLOW is an early-stage open standard and toolkit for multi-agent AI workflows.  
Feedback, bug reports and pull requests are very welcome.

---

## Ways to contribute

- 🐛 Report bugs and issues  
- 💡 Propose improvements to the `.aiflow` standard  
- 🧪 Add or improve example workflows in `examples/`  
- 🖥️ Improve the Studio UX or runtime behavior  
- 📚 Improve documentation, README, or spec text  

---

## Getting started (development)

1. Fork the repository on GitHub.  
2. Clone your fork:

   ```bash
   git clone https://github.com/<your-username>/AIflow
   cd AIflow
   ```

3. Install dependencies:

   ```bash
   npm install
   ```

4. Run the Studio in dev mode:

   ```bash
   npm run dev
   ```

5. Run an example workflow via CLI:

   ```bash
   export API_KEY=YOUR_GEMINI_API_KEY
   npm run run-flow -- ./examples/CustomerSupportFlow_v1.0.0.aiflow
   ```

---

## Coding guidelines

- Keep the codebase consistent with existing style (TypeScript + React).  
- Prefer small, focused pull requests over giant ones.  
- Include an example or test scenario when possible.  
- Update documentation if your change affects user-facing behavior.  

---

## Pull Request process

1. Create a feature branch:

   ```bash
   git checkout -b feat/my-feature
   ```

2. Make your changes and commit them:

   ```bash
   git commit -am "Add feature X"
   ```

3. Push to your fork:

   ```bash
   git push origin feat/my-feature
   ```

4. Open a Pull Request against the main `AIflow` repository.  

Please describe:

- What problem your PR solves  
- How you implemented it  
- Any limitations or follow-ups  

---

## Code of Conduct

Be respectful, constructive and kind.  
Discussions about the standard and implementation details are welcome, as long as they remain professional and focused.

---

Thank you for helping shape AIFLOW into an open standard that others can build on. 🙌
