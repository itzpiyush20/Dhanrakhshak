// Node 24 native WebSocket client - no imports needed!
const wsUrl = process.env.AGY_BROWSER_WS_URL;
if (!wsUrl) {
  console.error("AGY_BROWSER_WS_URL is not set!");
  process.exit(1);
}

console.log("Connecting to:", wsUrl);

const ws = new WebSocket(wsUrl);

ws.onopen = () => {
  console.log("Connected! Sending Target.getTargets...");
  ws.send(JSON.stringify({
    id: 1,
    method: "Target.getTargets"
  }));
};

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id === 1) {
    console.log("Targets list:");
    const targets = msg.result.targetInfos;
    targets.forEach(t => {
      console.log(`- Title: "${t.title}"\n  Type: ${t.type}\n  URL: ${t.url}\n  TargetId: ${t.targetId}\n`);
    });
    ws.close();
  }
};

ws.onerror = (err) => {
  console.error("WS Error:", err);
};

ws.onclose = () => {
  console.log("Connection closed.");
};
