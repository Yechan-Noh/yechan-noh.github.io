/*  lj-hero.js  ──────────────────────────────────────────────────────────
    Animated “CMBL” particle logo + fire-ball style repeller
    © 2025 Computational Molecular Biomimetics Lab
------------------------------------------------------------------------ */

(() => {
    const canvas = document.getElementById('titleCanvas');
    if (!canvas) return;                       // canvas might not exist on every page
    const ctx = canvas.getContext('2d', { alpha: true });
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let paused = !canvas.hasAttribute('data-autoplay') || reduced.matches;
    let inView = true;
    let frame = 0;
    let animationFrame = 0;
    let sceneScale = 1, viewWidth = 0, viewHeight = 0;

    /* ─── Mouse repulsion ────────────────────────────────────────────── */
    const mouse = { x: null, y: null, radius: 60 };
    canvas.addEventListener('mousemove', e => {
        const r = canvas.getBoundingClientRect();
        mouse.x = (e.clientX - r.left) / sceneScale;
        mouse.y = (e.clientY - r.top) / sceneScale;
    });
    canvas.addEventListener('mouseleave', () => { mouse.x = mouse.y = null; });

    /* ─── Fire-ball repeller (“autoCircle”) ──────────────────────────── */
    const autoCircle = {
        x: 0, y: 0,
        radius: 32,          // physics radius for repulsion
        vx: 1.5,             // horizontal speed
        coreR: 12,           // size of bright head
        hueHead: 45,         // hot yellow-orange
        hueTail: 5,          // deep red tail
        theta: 0, dTheta: 0.04,
        trail: [], trailMax: 18
    };

    /* ─── Particle class ─────────────────────────────────────────────── */
    class Particle {
        constructor(x, y) {
            this.baseX = x; this.baseY = y;
            this.x = x;
            this.y = y;
            this.size = Math.random() * 0.2 + 1.5;
            this.density = Math.random() * 25 + 5;
            this.vx = this.vy = 0;
            this.hue = 190 + Math.random() * 15;
        }
        draw() {
            ctx.fillStyle = `hsla(${this.hue},18%,40%,.95)`;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
        }
        update() {
            /* mouse repulsion */
            if (mouse.x !== null) {
                let dx = this.x - mouse.x,
                    dy = this.y - mouse.y,
                    d = Math.hypot(dx, dy);
                if (d < mouse.radius && d > 0.0001) {       // avoid divide-by-0
                    const f = (mouse.radius - d) / mouse.radius;
                    this.vx += (dx / d) * f * 2;
                    this.vy += (dy / d) * f * 2;
                }
            }
            /* fire-ball repulsion */
            {
                let dx = this.x - autoCircle.x,
                    dy = this.y - autoCircle.y,
                    d = Math.hypot(dx, dy);
                if (d < autoCircle.radius && d > 0.0001) {
                    const f = (autoCircle.radius - d) / autoCircle.radius;
                    this.vx += (dx / d) * f * 2;
                    this.vy += (dy / d) * f * 2;
                }
            }
            /* spring back & movement */
            this.vx += (this.baseX - this.x) / (this.density * 10);
            this.vy += (this.baseY - this.y) / (this.density * 10);
            this.vx *= 0.9; this.vy *= 0.9;
            this.x += this.vx; this.y += this.vy;
            // Keep the animation within the site’s blue–teal palette.
        }
    }

    /* ─── Build “CMBL” particle mask ────────────────────────────────── */
    const particles = [];
    function initParticles() {
        particles.length = 0;

        const TEXT = 'CMBL';
        let fontSize = 1.25 * Math.min(140, viewWidth / 3.4);
        const temp = document.createElement('canvas');
        const tctx = temp.getContext('2d');
        tctx.font = `bold ${fontSize}px Inter, Helvetica, sans-serif`;
        fontSize *= Math.min(1, (viewWidth - 32) / tctx.measureText(TEXT).width);
        tctx.font = `bold ${fontSize}px Inter, Helvetica, sans-serif`;
        temp.width = Math.ceil(tctx.measureText(TEXT).width) + 20;
        temp.height = Math.ceil(fontSize + 40);

        tctx.fillStyle = '#000';
        tctx.textAlign = 'center';
        tctx.textBaseline = 'middle';
        tctx.font = `bold ${fontSize}px Inter, Helvetica, sans-serif`;
        tctx.fillText(TEXT, temp.width / 2, temp.height / 2);

        const img = tctx.getImageData(0, 0, temp.width, temp.height).data;
        const offX = (viewWidth - temp.width) / 2;
        const offY = (viewHeight - temp.height) / 2;
        const gap = 5;

        for (let y = 0; y < temp.height; y += gap) {
            for (let x = 0; x < temp.width; x += gap) {
                if (img[(y * temp.width + x) * 4 + 3] > 128) {
                    particles.push(new Particle(x + offX, y + offY));
                }
            }
        }
    }

    /* ─── Thin particle connections ─────────────────────────────────── */
    function connect() {
        // Compare nearby particles only so denser lettering stays responsive.
        const cells = new Map();
        for (const p of particles) {
            const cx = Math.floor(p.x / 15), cy = Math.floor(p.y / 15);
            for (let x = cx - 1; x <= cx + 1; x++) {
                for (let y = cy - 1; y <= cy + 1; y++) {
                    for (const q of cells.get(`${x},${y}`) || []) {
                        const d = Math.hypot(p.x - q.x, p.y - q.y);
                        if (d >= 15) continue;
                        ctx.strokeStyle = `hsla(${p.hue},18%,40%,${0.4 - 0.4 * d / 15})`;
                        ctx.lineWidth = 0.85;
                        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
                    }
                }
            }
            const key = `${cx},${cy}`;
            if (!cells.has(key)) cells.set(key, []);
            cells.get(key).push(p);
        }
    }

    /* ─── Main animation loop ───────────────────────────────────────── */
    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        /* move the invisible repeller */
        const w = viewWidth;
        autoCircle.x += autoCircle.vx;
        if (autoCircle.x > w + autoCircle.radius) autoCircle.x = -autoCircle.radius;

        /* update + draw particles */
        for (const p of particles) { p.update(); p.draw(); }
        connect();

        canvas.dataset.frame = String(++frame);
        if (!paused && inView && !document.hidden) animationFrame = requestAnimationFrame(animate);
    }

    /* ─── Responsive / Hi-DPI handling ──────────────────────────────── */
    function resize() {
        // Keep desktop-density lettering on phones, then render at native pixel density.
        const width = canvas.clientWidth, height = canvas.clientHeight;
        sceneScale = Math.min(1, width / 320);
        viewWidth = width / sceneScale;
        viewHeight = height / sceneScale;
        const dpr = Math.max(3, window.devicePixelRatio || 1);
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        ctx.setTransform(dpr * sceneScale, 0, 0, dpr * sceneScale, 0, 0);
        autoCircle.y = viewHeight * 0.46;
        initParticles();
    }

    window.addEventListener('resize', resize);
    function resume() { cancelAnimationFrame(animationFrame); if (!paused && inView && !document.hidden) animate(); }
    window.addEventListener("cmbl-motion", e => { paused = !e.detail; resume(); });
    new IntersectionObserver(entries => { inView = entries[0].isIntersecting; resume(); }).observe(canvas);
    document.addEventListener('visibilitychange', resume);
    reduced.addEventListener('change', e => { if (e.matches) { paused = true; cancelAnimationFrame(animationFrame); const b=document.getElementById('motion'); if(b){b.dataset.paused='true';b.setAttribute('aria-label','Play CMBL animation');b.setAttribute('aria-pressed','false');} } });
    if(reduced.matches){ const b=document.getElementById('motion'); if(b){b.dataset.paused='true';b.setAttribute('aria-label','Play CMBL animation');} }
    resize();
    animate();
})();
