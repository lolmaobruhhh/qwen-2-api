<div align="center">

# 🚀 Qwen Chat Proxy Bridge
**A lightning-fast, production-ready reverse proxy bridging standard OpenAI completion requests into native Qwen 2.5/3 API sessions.**

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![OpenAI Compatible](https://img.shields.io/badge/API-OpenAI_Compatible-blue.svg)](https://platform.openai.com/docs/api-reference/chat)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![AI Generated](https://img.shields.io/badge/Created_by-AI-%23FF4081)](https://DeepMind.com)

</div>

---

### ✨ Live Practical Demo
You can see the proxy in action without deploying it yourself over on Hugging Face Spaces:  
👉 **[Qwen Proxy Bridge Demo](https://rhbstntsmnde-qwen.hf.space/)**

*Just plug `https://rhbstntsmnde-qwen.hf.space/v1` into your favorite OpenAI-compatible frontend (SillyTavern, JanitorAI, etc.) and it will stream natively!*

---

## 🌪️ Key Features

This proxy isn't just a simple fetch wrapper. It is engineered with extreme robustness to perfectly mock a true API environment:

* **⚡ Native SSE Streaming (JanitorAI & SillyTavern):** Bulletproof streaming handlers extract Qwen's dual-phase (`thinking_summary` & `answer`) generations and wraps the reasoning block dynamically inside literal `<think>` tags so your frontend can render it beautifully.
* **🔁 Native Conversational Rerolls:** Bypasses messy "context dumping" by saving explicit Qwen internal `parent_id` footprints. When you click **Reroll/Retry**, it effortlessly reconstructs the tree utilizing Qwen's organic `user_action: "retry"` feature.
* **🧠 Dynamic Thinking Control:** You dictate the proxy's thinking modes directly from your prompt! Inject `[think=fast]`, `[think=on]`, or `[think=off]` into your chat message, and the proxy natively toggles Qwen's backend routines.
* **🔄 Full Account Pooling & Auth DB:** Utilizes `better-sqlite3` to securely store multiple Qwen accounts, tracking `expires_at` JWT JWT lifecycles, coalescing concurrent token refreshes (debounce logic), and rotating active sessions without ever throttling limits.
* **🛡️ Deep Memory-Leak Prevention:** Monitors TCP connection boundaries to proactively abort and tear down upstream upstream Qwen generations if a user cancels a request locally, preventing "ghost bandwidth" leaks.

---

## 🛠️ How to Use Locally

1. **Clone & Install**
   ```bash
   git clone https://github.com/Sexlovr/qwen-2-api.git
   cd qwen-2-api
   npm install
   ```

2. **Start the Proxy Server**
   ```bash
   npm start
   ```

3. **Add Accounts (Admin Panel)**
   Open `http://localhost:7860` in your web browser. Type in any Qwen Chat email and password pairs you own. The proxy automatically retrieves their tokens!

4. **Connect your Frontend**
   Point your application (SillyTavern, JanitorAI, etc.) to your proxy:  
   **API URL:** `http://localhost:7860/v1`  
   **Model:** `qwen3.7-plus` *(or any other)*  
   **API Key:** *(Can be anything, the proxy identifies unique sessions by hashing this key!)*

---

## ☁️ Deploy on HuggingFace Spaces

This project includes a multi-stage Dockerfile heavily optimized for Hugging Face Spaces:

1. Create a incredibly basic `Docker` Space on Hugging Face.
2. In your Space's Settings, create a Persistent Storage at `/data`.
3. Push everything in this repository directly into your space. 
4. Head to your space root URL to access the admin panel! 

*Warning: Because Hugging Face Spaces are public, make sure to add an `ADMIN_PASSWORD` secret to your Space Variables to protect your admin dashboard.*

---

## 🤖 Disclaimer

> **Note:** This entire highly-optimized architecture was conceptually architected, coded, audited, and maintained entirely by an **AI Agent**. Humans took a well-deserved nap. 💤
