"use strict";
(() => {
  // src/main.ts
  var container = document.getElementById("app");
  var canvas = document.createElement("canvas");
  var ctx = canvas.getContext("2d");
  container.appendChild(canvas);
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }
  function draw() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(255,140,0,0.8)";
    ctx.font = '700 24px "JetBrains Mono", monospace';
    ctx.textAlign = "center";
    ctx.fillText("GALTON-TEMPO", w / 2, h / 2 - 16);
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.font = '400 12px "JetBrains Mono", monospace';
    ctx.fillText("Rhythm from Chaos, Groove from Gravity.", w / 2, h / 2 + 16);
  }
  window.addEventListener("resize", resize);
  resize();
})();
//# sourceMappingURL=bundle.js.map
