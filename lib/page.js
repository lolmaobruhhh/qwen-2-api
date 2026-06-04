export const adminHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Qwen Proxy Administration</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap');
        
        :root {
            --primary: #8a2be2;
            --secondary: #ff007f;
            --accent: #00f0ff;
            --bg-dark: #0a0a0f;
            --glass-bg: rgba(255, 255, 255, 0.05);
            --glass-border: rgba(255, 255, 255, 0.1);
        }

        body {
            margin: 0;
            padding: 0;
            font-family: 'Outfit', sans-serif;
            background-color: var(--bg-dark);
            color: #fff;
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            background-image: 
                radial-gradient(circle at 15% 50%, rgba(138, 43, 226, 0.15) 0%, transparent 50%),
                radial-gradient(circle at 85% 30%, rgba(255, 0, 127, 0.15) 0%, transparent 50%);
            animation: bgShift 20s ease-in-out infinite alternate;
        }

        @keyframes bgShift {
            0% { background-position: 0% 0%; }
            100% { background-position: 100% 100%; }
        }

        .container {
            width: 90%;
            max-width: 1200px;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 2rem;
            padding: 2rem;
        }
        
        @media (max-width: 900px) {
            .container { grid-template-columns: 1fr; }
        }

        .glass-panel {
            background: var(--glass-bg);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            border: 1px solid var(--glass-border);
            border-radius: 20px;
            padding: 2rem;
            box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
            transition: transform 0.3s ease, box-shadow 0.3s ease;
        }

        .glass-panel:hover {
            transform: translateY(-5px);
            box-shadow: 0 12px 40px 0 rgba(0, 0, 0, 0.5);
            border-color: rgba(255, 255, 255, 0.2);
        }

        h2 {
            margin-top: 0;
            font-weight: 800;
            font-size: 2rem;
            background: linear-gradient(90deg, #fff, var(--accent));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 0.5rem;
        }

        p.subtitle {
            color: #aaa;
            margin-bottom: 2rem;
            font-size: 0.9rem;
        }

        .input-group {
            margin-bottom: 1.5rem;
        }

        .input-group label {
            display: block;
            margin-bottom: 0.5rem;
            font-size: 0.9rem;
            color: #ccc;
        }

        input[type="text"], input[type="email"], input[type="password"] {
            width: 100%;
            padding: 12px;
            border-radius: 10px;
            border: 1px solid var(--glass-border);
            background: rgba(0, 0, 0, 0.2);
            color: #fff;
            font-family: inherit;
            box-sizing: border-box;
            transition: border-color 0.3s, box-shadow 0.3s;
        }

        input:focus {
            outline: none;
            border-color: var(--primary);
            box-shadow: 0 0 10px rgba(138, 43, 226, 0.3);
        }

        button {
            width: 100%;
            padding: 12px;
            border: none;
            border-radius: 10px;
            background: linear-gradient(45deg, var(--primary), var(--secondary));
            color: white;
            font-family: inherit;
            font-weight: 600;
            font-size: 1rem;
            cursor: pointer;
            transition: opacity 0.3s, transform 0.1s;
        }

        button:hover {
            opacity: 0.9;
        }

        button:active {
            transform: scale(0.98);
        }

        /* Accounts Table */
        .account-list {
            margin-top: 1rem;
            max-height: 400px;
            overflow-y: auto;
        }

        .account-card {
            background: rgba(0,0,0,0.3);
            border: 1px solid var(--glass-border);
            border-radius: 12px;
            padding: 1rem;
            margin-bottom: 1rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .acc-details h3 {
            margin: 0 0 0.2rem 0;
            font-size: 1.1rem;
            color: #fff;
        }

        .acc-details p {
            margin: 0;
            font-size: 0.8rem;
            color: #aaa;
        }
        
        .acc-status {
            font-size: 0.8rem;
            padding: 4px 8px;
            border-radius: 20px;
            background: rgba(0, 255, 0, 0.1);
            color: #0f0;
            border: 1px solid rgba(0, 255, 0, 0.3);
        }
        
        .acc-status.inactive {
            background: rgba(255, 0, 0, 0.1);
            color: #f00;
            border-color: rgba(255, 0, 0, 0.3);
        }

        .btn-small {
            width: auto;
            padding: 6px 12px;
            font-size: 0.8rem;
            background: transparent;
            border: 1px solid var(--secondary);
            color: var(--secondary);
        }
        .btn-small:hover {
            background: rgba(255,0,127,0.1);
        }

        .code-block {
            background: rgba(0,0,0,0.5);
            padding: 1rem;
            border-radius: 10px;
            font-family: monospace;
            font-size: 14px;
            color: #00f0ff;
            word-break: break-all;
            margin-bottom: 1rem;
            border: 1px solid var(--glass-border);
            display: flex;
            justify-content: space-between;
            align-items: center;
            cursor: pointer;
        }

        .code-block:hover {
            border-color: var(--accent);
        }
        
        ::-webkit-scrollbar {
            width: 8px;
        }
        ::-webkit-scrollbar-track {
            background: transparent;
        }
        ::-webkit-scrollbar-thumb {
            background: rgba(255,255,255,0.2);
            border-radius: 4px;
        }

        .notification {
            position: fixed;
            top: 20px;
            right: 20px;
            background: var(--primary);
            color: white;
            padding: 1rem;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.5);
            transform: translateX(150%);
            transition: transform 0.3s ease;
            z-index: 1000;
        }
        
        .notification.show {
            transform: translateX(0);
        }
    </style>
</head>
<body>
    <div id="toast" class="notification">Message</div>

    <div class="container">
        <!-- Left Column -->
        <div class="left-col">
            <div class="glass-panel" style="margin-bottom: 2rem;">
                <h2>Add Qwen Account</h2>
                <p class="subtitle">Enter your email and password. The system will securely automatically fetch the tokens and keep the session alive.</p>
                <form id="addAccountForm">
                    <div class="input-group">
                        <label>Email Address</label>
                        <input type="email" id="email" required placeholder="user@example.com">
                    </div>
                    <div class="input-group">
                        <label>Password</label>
                        <input type="password" id="password" required placeholder="Qwen account password">
                    </div>
                    <button type="submit">Deploy Account 🚀</button>
                </form>
            </div>

            <div class="glass-panel">
                <h2>Proxy Configuration</h2>
                <p class="subtitle">Use these details in your frontend (JanitorAI, SillyTavern, etc).</p>
                
                <label style="font-size:0.9rem; color:#ccc;">API Reverse Proxy URL</label>
                <div class="code-block" onclick="copyText('Proxy URL', window.location.origin + '/v1')">
                    <span id="proxyUrl">http://localhost:7860/v1</span>
                    <span>📑</span>
                </div>

                <label style="font-size:0.9rem; color:#ccc;">Models (Supports native & aliases)</label>
                <div style="display:flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1rem;">
                    <div class="acc-status">qwen3.7-plus</div>
                    <div class="acc-status">qwen-proxy</div>
                </div>
            </div>
        </div>

        <!-- Right Column -->
        <div class="right-col">
            <div class="glass-panel" style="height: 100%; box-sizing: border-box;">
                <h2>Active Sessions</h2>
                <p class="subtitle">Current Qwen sessions rotating in the load balancer.</p>
                
                <div class="account-list" id="accountList">
                    <!-- Accounts injected via JS -->
                    <div style="text-align:center; color:#888; padding:2rem;">Loading accounts...</div>
                </div>
            </div>
        </div>
    </div>

    <script>
        const API_BASE = window.location.origin + "/api";
        const proxyUrlSpan = document.getElementById("proxyUrl");
        proxyUrlSpan.innerText = window.location.origin + "/v1";

        function showToast(msg) {
            const t = document.getElementById("toast");
            t.innerText = msg;
            t.classList.add("show");
            setTimeout(() => t.classList.remove("show"), 3000);
        }

        async function fetchAccounts() {
            try {
                const res = await fetch(API_BASE + "/accounts");
                const data = await res.json();
                renderAccounts(data.accounts);
            } catch(e) {
                console.error(e);
            }
        }

        function copyText(name, text) {
            navigator.clipboard.writeText(text);
            showToast(name + " copied!");
        }

        function renderAccounts(accounts) {
            const list = document.getElementById("accountList");
            if (accounts.length === 0) {
                list.innerHTML = "<div style='text-align:center; color:#888; padding:2rem;'>No accounts deployed yet.</div>";
                return;
            }
            
            list.innerHTML = accounts.map(acc => {
                const isTokenValid = acc.token && acc.expires_at > (Date.now()/1000);
                return \`
                    <div class="account-card">
                        <div class="acc-details">
                            <h3>\${acc.email}</h3>
                            <p>Requests: <b>\${acc.request_count}</b> | Token Status: \${isTokenValid ? '<span style="color:var(--accent)">Valid</span>' : '<span style="color:var(--secondary)">Needs Login</span>'}</p>
                        </div>
                        <div style="text-align:right">
                            <div class="acc-status \${acc.active ? '' : 'inactive'}" style="margin-bottom:0.5rem; display:inline-block">
                                \${acc.active ? 'ACTIVE' : 'FAILED'}
                            </div><br>
                            <button class="btn-small" onclick="deleteAccount(\${acc.id})">Remove</button>
                        </div>
                    </div>
                \`;
            }).join("");
        }

        document.getElementById("addAccountForm").addEventListener("submit", async (e) => {
            e.preventDefault();
            const btn = e.target.querySelector("button");
            btn.innerText = "Deploying...";
            btn.style.opacity = "0.5";
            
            const email = document.getElementById("email").value;
            const password = document.getElementById("password").value;

            try {
                const res = await fetch(API_BASE + "/accounts", {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({ email, password })
                });
                
                const data = await res.json();
                if(data.success) {
                    showToast("Account added successfully!");
                    document.getElementById("email").value = "";
                    document.getElementById("password").value = "";
                    fetchAccounts();
                } else {
                    showToast("Failed to add account");
                }
            } catch(err) {
                showToast("Network Error");
            } finally {
                btn.innerText = "Deploy Account 🚀";
                btn.style.opacity = "1";
            }
        });

        async function deleteAccount(id) {
            if(!confirm("Are you sure you want to remove this account?")) return;
            try {
                await fetch(API_BASE + "/accounts/" + id, { method: "DELETE" });
                showToast("Account removed");
                fetchAccounts();
            } catch(e) {
                showToast("Failed to remove account");
            }
        }

        // Init
        fetchAccounts();
    </script>
</body>
</html>
`;
