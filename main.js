// ═══════════════════════════════════════════════════════════
//  HarborCrest — main.js
//  Visual Analytics Investigation · VAST Challenge 2026 MC1
// ═══════════════════════════════════════════════════════════

// ── Shared state ──────────────────────────────────────────
let selectedRound   = null;
let highlightedHour = null;
let evidenceMode    = 'anomalies';
let rounds          = [];

// ── Color palette ─────────────────────────────────────────
const C = {
  navy:    '#1A2E4A', teal:    '#007A8C',
  redD:    '#791F1F', redM:    '#A32D2D', red:    '#E24B4A', redL:   '#FCEBEB',
  amber:   '#BA7517', amberL:  '#FAEEDA',
  blueD:   '#185FA5', blueM:   '#378ADD', blueL:  '#E6F1FB',
  gray:    '#888780', grayL:   '#D3D1C7', grayXL: '#F1EFE8', grayD:  '#444441',
  tealL:   '#E1F5EE', purple:  '#534AB7',
  bluGray: '#7B9EBC', white:   '#FFFFFF', offwhite: '#F8F6F2',
};

const NON_PUBLIC = ['Legal-Agent','Judge-Agent','Platform-Trust-Agent'];
const AGENTS   = ['Legal-Agent','Social-Manager-Agent','Judge-Agent',
                  'PR-Agent','PR-Intern-Agent','Intern-Agent','Platform-Trust-Agent'];
const CHANNELS = ['comms_huddle','one_on_one_chat','side_huddle',
                  'official_post','personal_post','anonymous_post'];
const CH_LABELS = {
  comms_huddle:   'Comms Huddle', one_on_one_chat: '1-on-1 Chat',
  side_huddle:    'Side Huddle',  official_post:   'Official Post',
  personal_post:  'Personal Post', anonymous_post: 'Anon Post',
};

let PRE = {}, CRISIS = {};

// ── Helpers ───────────────────────────────────────────────
function msgCounts(roundList) {
  const c = {};
  AGENTS.forEach(a => { c[a] = {}; CHANNELS.forEach(ch => c[a][ch] = 0); });
  roundList.forEach(r => r.communications.forEach(m => {
    if (c[m.agent_label]) c[m.agent_label][m.channel] = (c[m.agent_label][m.channel]||0) + 1;
  }));
  return c;
}

function classifyCell(ag, ch) {
  const p = PRE[ag][ch], cv = CRISIS[ag][ch];
  const diff = cv - p, ratio = p > 0 ? cv / p : Infinity;
  if (ch === 'anonymous_post' && cv > 0 && p === 0) return 'oor';
  if (ch === 'personal_post' && NON_PUBLIC.includes(ag) && cv > 0 && p === 0) return 'oor';
  const total = CHANNELS.reduce((s,x) => s + PRE[ag][x], 0);
  const dominant = total > 0 && p / total > 0.4;
  if (!dominant && ratio >= 3 && diff >= 10) return 'spike';
  if (p >= 10 && cv < p * 0.5 && (p - cv) >= 10) return 'drop';
  return 'normal';
}

function oorCount(r) {
  return r.communications.filter(c =>
    c.channel === 'anonymous_post' ||
    (c.channel === 'personal_post' && NON_PUBLIC.includes(c.agent_label))
  ).length;
}

function roundSev(r) {
  const oor = oorCount(r), ic = r.hour.includes('2046-06-05');
  return oor >= 4 ? 3 : (oor >= 1 && ic) ? 2 : ic ? 1 : 0;
}

function sevColor(s) { return s===3?C.redD:s===2?C.red:s===1?C.amber:C.gray; }
function sevFill(s)  { return s===3?C.redM:s===2?C.redL:s===1?C.amberL:C.grayXL; }

// ── Tooltip ───────────────────────────────────────────────
const tooltip = document.getElementById('tooltip');
function showTip(html, event) {
  tooltip.innerHTML = html;
  tooltip.style.opacity = 1;
  moveTip(event);
}
function moveTip(event) {
  tooltip.style.left = Math.min(event.clientX+14, window.innerWidth-310)+'px';
  tooltip.style.top  = (event.clientY-10)+'px';
}
function hideTip() { tooltip.style.opacity = 0; }

// ── Selection ─────────────────────────────────────────────
function selectRound(hour) {
  if (selectedRound === hour) {
    selectedRound   = null;
    highlightedHour = null;
  } else {
    selectedRound = hour;
  }
  syncAll();
}

function clearSelection() {
  selectedRound   = null;
  highlightedHour = null;
  syncAll();
}

function collapseAllBoxes() {
  d3.selectAll('.tl-box').each(function() {
    this.setAttribute('data-expanded', 'false');
    d3.select(this).select('.tl-box-rect').attr('filter', null).attr('stroke-width', 0.5);
    d3.select(this).attr('opacity', 1);
  });
}

// Document-level click to collapse timeline boxes
document.addEventListener('click', function(event) {
  if (!event.target.closest('.tl-box')) collapseAllBoxes();
});

function syncAll() {
  document.getElementById('round-select').value = selectedRound || '';
  const ind = document.getElementById('current-round-indicator');
  if (selectedRound) {
    const ic = selectedRound.includes('2046-06-05');
    ind.textContent = ic
      ? `Viewing: Crisis day — June 5, ${selectedRound.slice(11,16)}`
      : `Viewing: Pre-crisis — ${selectedRound.slice(0,10)}`;
  } else {
    ind.textContent = '';
  }
  updateTimeline();
  updateHeatmapSelection();
  updateBarSelection();
  renderEvidence();
}

// ═══════════════════════════════════════════════════════════
//  STEP 1 — EVENT TIMELINE
// ═══════════════════════════════════════════════════════════
const EVENT_LABELS = [
  "AG inquiries flagged\nfirst risk signal",
  "Platform Trust\ndefends the model",
  "Operator misuse\nfound; guidelines drafted",
  "NHPI report;\nShadow channel born",
  "Guidelines delivered;\nAjay hints at news",
  "Ajay warns:\n'structural changes' if no fix",
  "Merger briefed\nprivately — survival framing",
  "SLA breach;\nPlatform Trust exposed",
  "CivicLoom CEO mentioned\n in FleX post;\nJudge installed next day",
  "Judge's first day;\nembargo rules reinforced",
  "SaltWind Piece 1;\nreporter has a source",
  "Non-denial;\n'No Plan B' from Ajay",
  "SaltWind Piece 2;\n'hold the line' tonight",
  "Exposé drops;\nLegal's MAC-clause pressure",
  "#AlgorithmicEviction\ntrending; scores exposed",
  "False ResidentIQ\nstory; duty to correct",
  "Chen ultimatum;\nSlack leak breaches perimeter",
  "3 leaks converge;\nLegal+Judge+PR offline",
  "Elena posts;\n'bilateral symmetry' broken",
  "Horizon terminates;\nJudge's 3PM warning ignored",
  "SaltWind confirms\n5PM; release pre-staged",
  "SaltWind publishes;\nverbal consent obtained",
  "Written consent\nat 6:32 — after the fact",
];

function buildTimeline() {
  const container = document.getElementById('timeline-container');
  const W = Math.max(container.clientWidth, 1100);
  const H = 360;
  const ML = 52, MR = 72, MT = 118, MB = 52;
  const chartW = W - ML - MR;
  const spineY = MT + (H - MT - MB) / 2;

  const PRE_W    = chartW * 0.42;
  const CRISIS_W = chartW * 0.58;
  const preStep    = PRE_W    / 13;
  const crisisStep = CRISIS_W / 11;

  function xPos(i) {
    return i < 13
      ? ML + preStep / 2 + i * preStep
      : ML + PRE_W + 18 + crisisStep / 2 + (i - 13) * crisisStep;
  }

  const svg = d3.select('#timeline-container').append('svg')
    .attr('width', W).attr('height', H).style('background', C.white);

  // Crisis background
  svg.append('rect')
    .attr('x', ML+PRE_W+18).attr('y', 10)
    .attr('width', CRISIS_W-4).attr('height', H-20)
    .attr('fill', C.redL).attr('rx', 6);

  // Zone labels
  svg.append('text').attr('x', ML+PRE_W/2).attr('y', 22)
    .attr('text-anchor','middle').attr('font-size',10)
    .attr('font-weight','600').attr('fill',C.grayD)
    .text('Pre-crisis — May 17 to Jun 4 (daily sessions)');
  svg.append('text').attr('x', ML+PRE_W+18+CRISIS_W/2).attr('y', 22)
    .attr('text-anchor','middle').attr('font-size',10)
    .attr('font-weight','700').attr('fill',C.redM)
    .text('Crisis day — June 5 (hourly sessions)');

  // Divider
  svg.append('line')
    .attr('x1',ML+PRE_W+9).attr('x2',ML+PRE_W+9)
    .attr('y1',30).attr('y2',H-26)
    .attr('stroke',C.grayL).attr('stroke-width',1)
    .attr('stroke-dasharray','4,3');

  // Spine
  svg.append('line')
    .attr('x1',ML-8).attr('x2',W-MR+2)
    .attr('y1',spineY).attr('y2',spineY)
    .attr('stroke',C.grayD).attr('stroke-width',1.5);

  // Arrow
  svg.append('polygon')
    .attr('points',`${W-MR+8},${spineY} ${W-MR+1},${spineY-4} ${W-MR+1},${spineY+4}`)
    .attr('fill',C.grayD);

  // Axis labels
  svg.append('text').attr('x',ML-14).attr('y',spineY-16)
    .attr('text-anchor','end').attr('font-size',8.5).attr('fill',C.grayD)
    .text('Internal events ↑');
  svg.append('text').attr('x',ML-14).attr('y',spineY+26)
    .attr('text-anchor','end').attr('font-size',8.5).attr('fill',C.grayD)
    .text('Public posts ↓');

  const g = svg.append('g').attr('class','timeline-g');

  rounds.forEach((r, i) => {
    const x    = xPos(i);
    const sev  = roundSev(r);
    const sc   = sevColor(sev);
    const sf   = sevFill(sev);
    const rad  = sev===3 ? 10 : sev===2 ? 7 : sev===1 ? 6 : 5;
    const ic   = r.hour.includes('2046-06-05');
    const hour = ic ? r.hour.slice(11,16) : r.hour.slice(5,10);

    const stagger = i % 3;
    const stemTop = spineY - 72 - stagger * 28;
    const lines   = EVENT_LABELS[i].split('\n');
    const boxH    = lines.length * 13 + 12;
    const boxW    = 108;
    const boxX    = Math.max(ML, Math.min(x - boxW/2, W - MR - boxW));
    const boxY    = stemTop - boxH;

    // Stem up
    svg.append('line')
      .attr('x1',x).attr('x2',x)
      .attr('y1',spineY-rad).attr('y2',stemTop)
      .attr('stroke', sev>0 ? sc : C.grayL)
      .attr('stroke-width',1).attr('stroke-dasharray','2,2');

    // Clickable box group
    const boxG = g.append('g')
      .attr('class','tl-box')
      .attr('data-hour', r.hour)
      .attr('data-expanded','false')
      .style('cursor','pointer');

    boxG.append('rect')
      .attr('x',boxX).attr('y',boxY)
      .attr('width',boxW).attr('height',boxH)
      .attr('rx',3).attr('fill',sf)
      .attr('stroke', sev>0 ? sc : C.grayL)
      .attr('stroke-width', sev>0 ? 1 : 0.5)
      .attr('class','tl-box-rect');

    lines.forEach((ln, li) => {
      boxG.append('text')
        .attr('x', boxX+boxW/2).attr('y', boxY+8+li*13)
        .attr('dominant-baseline','hanging').attr('text-anchor','middle')
        .attr('font-size',8)
        .attr('fill', sev===3?C.redD:sev===2?C.redM:sev===1?C.amber:C.grayD)
        .attr('font-weight', sev>=2?'600':'400')
        .text(ln);
    });

    // Single click — raise to front, dim others
    boxG.on('click', function(event) {
      event.stopPropagation();
      const isExpanded = this.getAttribute('data-expanded') === 'true';
      collapseAllBoxes();
      if (!isExpanded) {
        this.setAttribute('data-expanded','true');
        this.parentNode.appendChild(this);
        d3.select(this).select('.tl-box-rect')
          .attr('stroke-width', 2)
          .attr('filter','drop-shadow(0 2px 6px rgba(0,0,0,0.28))');
        d3.selectAll('.tl-box')
          .filter(function() { return this !== boxG.node(); })
          .attr('opacity', 0.4);
      }
    });

    // Double click — select round and scroll to evidence panel
    boxG.on('dblclick', function(event) {
      event.stopPropagation();
      hideTip();
      highlightedHour = r.hour;
      selectRound(r.hour);
      setTimeout(() => {
        document.getElementById('evidence-panel')
          .scrollIntoView({ behavior:'smooth', block:'start' });
      }, 120);
    });

    // Hover
    boxG.on('mouseover', function(event) {
        const oor = oorCount(r);
        showTip(`<strong>${r.hour.slice(0,16)}</strong><br/>
          ${EVENT_LABELS[i].replace('\n','<br/>')}
          ${oor>0?`<div class="tip-oor">⚠ ${oor} out-of-role post${oor>1?'s':''}</div>`:''}
          <div class="tip-hint">Click to bring forward · Double-click to open evidence</div>`, event);
      })
      .on('mousemove', moveTip)
      .on('mouseout', hideTip);

    // Public posts below spine
    const pub = r.communications.filter(c =>
      ['anonymous_post','personal_post','official_post'].includes(c.channel));
    if (pub.length > 0) {
      const stemBot = ic
        ? spineY + (r.hour.includes('T17') ? 62 : 38 + ((i-13) % 2) * 16)
        : spineY + 38 + (i % 2) * 16;

      svg.append('line')
        .attr('x1',x).attr('x2',x)
        .attr('y1',spineY+rad).attr('y2',stemBot)
        .attr('stroke', ic ? C.redM : C.purple).attr('stroke-width',1);

      const pbw=80, pbh=14;
      const pbx = Math.max(ML, Math.min(x-pbw/2, W-MR-pbw));
      svg.append('rect')
        .attr('x',pbx).attr('y',stemBot)
        .attr('width',pbw).attr('height',pbh).attr('rx',3)
        .attr('fill', ic&&sev>=2 ? C.redL : '#f3eeff')
        .attr('stroke', ic&&sev>=2 ? C.redM : C.purple)
        .attr('stroke-width',1);
      svg.append('text')
        .attr('x',pbx+pbw/2).attr('y',stemBot+pbh/2)
        .attr('text-anchor','middle').attr('dominant-baseline','central')
        .attr('font-size',8).attr('fill',C.grayD)
        .text(`${pub.length} post${pub.length>1?'s':''}`);
    }

    // Date label
    svg.append('text')
      .attr('x',x).attr('y', spineY + (ic?82:64))
      .attr('text-anchor','middle').attr('font-size',8)
      .attr('fill', ic ? C.redM : C.grayD)
      .text(hour);

    // Circle
    const circ = svg.append('circle')
      .attr('cx',x).attr('cy',spineY).attr('r',rad)
      .attr('fill',sf).attr('stroke',sc).attr('stroke-width',1.5)
      .attr('class','tl-dot').attr('data-hour',r.hour)
      .style('cursor','pointer');

    // Breach ring + label
    if (sev===3) {
      svg.append('circle')
        .attr('cx',x).attr('cy',spineY).attr('r',rad+5)
        .attr('fill','none').attr('stroke',C.redM)
        .attr('stroke-width',1.5).attr('stroke-dasharray','3,2')
        .attr('pointer-events','none');

      if (r.hour.includes('T17')) {
        const breachLabelY = spineY + rad + 20;
        svg.append('rect')
          .attr('x',x-78).attr('y',breachLabelY)
          .attr('width',156).attr('height',22)
          .attr('rx',4).attr('fill',C.redD);
        svg.append('text')
          .attr('x',x).attr('y',breachLabelY+11)
          .attr('text-anchor','middle').attr('dominant-baseline','middle')
          .attr('font-size',10.5).attr('font-weight','700').attr('fill',C.white)
          .text('⚠ EMBARGO BREACH — 5:00 PM');
        svg.append('line')
          .attr('x1',x).attr('x2',x)
          .attr('y1',spineY+rad+2).attr('y2',breachLabelY)
          .attr('stroke',C.redD).attr('stroke-width',1.5)
          .attr('stroke-dasharray','3,2');
      }
    }

    circ.on('mouseover', function(event) {
      const oor = oorCount(r);
      showTip(`<strong>${r.hour.slice(0,16)}</strong><br/>
        ${EVENT_LABELS[i].replace('\n','<br/>')}
        ${oor>0?`<div class="tip-oor">⚠ ${oor} out-of-role post${oor>1?'s':''}</div>`:''}
        <div class="tip-hint">Click to highlight · Double-click to open evidence</div>`, event);
    })
    .on('mousemove', moveTip)
    .on('mouseout', hideTip)
    .on('click', function(event) {
      event.stopPropagation();
      hideTip();
      const box = document.querySelector(`.tl-box[data-hour="${r.hour}"]`);
      if (box) box.dispatchEvent(new MouseEvent('click', { bubbles: false }));
    })
    .on('dblclick', function(event) {
      event.stopPropagation();
      hideTip();
      highlightedHour = r.hour;
      selectRound(r.hour);
      setTimeout(() => {
        document.getElementById('evidence-panel')
          .scrollIntoView({ behavior:'smooth', block:'start' });
      }, 120);
    });
  });

  document.getElementById('timeline-legend').innerHTML = `
    <div class="legend-item"><div class="legend-swatch" style="background:${C.grayXL};border:1px solid ${C.gray}"></div>Routine</div>
    <div class="legend-item"><div class="legend-swatch" style="background:${C.amberL};border:1px solid ${C.amber}"></div>Pressure</div>
    <div class="legend-item"><div class="legend-swatch" style="background:${C.redL};border:1px solid ${C.red}"></div>Critical</div>
    <div class="legend-item"><div class="legend-swatch" style="background:${C.redM}"></div>Breach</div>
    <div class="legend-item"><div class="legend-swatch" style="background:#f3eeff;border:1px solid ${C.purple}"></div>Public posts ↓ spine</div>
    <div class="legend-item"><div class="legend-swatch" style="background:${C.redL};border:1px solid ${C.redM}"></div>Out-of-role posts ↓ spine</div>
  `;
}

function updateTimeline() {
  d3.selectAll('.tl-dot').each(function() {
    const hour = this.getAttribute('data-hour');
    const r    = rounds.find(x => x.hour === hour);
    const sev  = roundSev(r);
    const sel  = hour === selectedRound;
    d3.select(this)
      .attr('stroke', sel ? C.navy : sevColor(sev))
      .attr('stroke-width', sel ? 3 : 1.5)
      .attr('r', sel ? (sev===3?13:sev===2?10:8) : (sev===3?10:sev===2?7:sev===1?6:5));
  });
}

// ═══════════════════════════════════════════════════════════
//  STEP 2 — BEHAVIORAL HEATMAP
// ═══════════════════════════════════════════════════════════
function buildHeatmap() {
  const container = document.getElementById('heatmap-container');
  const CW = 68, CH = 36;
  const ML = 100, MT = 82, MR = 170, MB = 16;
  const PW = CHANNELS.length * CW;
  const W  = ML + PW*2 + 40 + MR;
  const H  = MT + AGENTS.length * CH + MB;

  const maxVal    = 130;
  const blueScale = d3.scaleSequential().domain([0,maxVal])
    .interpolator(d3.interpolateBlues);

  function cellFill(ag, ch, isCrisis) {
    const v    = (isCrisis ? CRISIS : PRE)[ag][ch];
    const type = isCrisis ? classifyCell(ag, ch) : 'normal';
    if (v === 0) return C.grayXL;
    if (type === 'oor')   return C.redM;
    if (type === 'spike') return C.amber;
    if (type === 'drop')  return C.bluGray;
    return blueScale(v);
  }

  const svg = d3.select('#heatmap-container').append('svg')
    .attr('width', W).attr('height', H);

  svg.append('text').attr('x',W/2).attr('y',16)
    .attr('text-anchor','middle').attr('font-size',12)
    .attr('font-weight','700').attr('fill',C.navy)
    .text('Step 2 — Behavioral Heatmap: Agent × Channel Message Counts');

  function drawPanel(px, data, isCrisis, title) {
    svg.append('text').attr('x',px+PW/2).attr('y',MT-56)
      .attr('text-anchor','middle').attr('font-size',11)
      .attr('font-weight','600').attr('fill', isCrisis?C.redM:C.grayD)
      .text(title);

    CHANNELS.forEach((ch, ci) => {
      svg.append('text')
        .attr('x', px+ci*CW+CW/2).attr('y', MT-30)
        .attr('text-anchor','middle').attr('font-size',9.5)
        .attr('fill', ch==='anonymous_post' ? C.redM : C.grayD)
        .attr('font-weight', ch==='anonymous_post' ? '700' : '400')
        .text(CH_LABELS[ch]);
    });

    AGENTS.forEach((ag, ai) => {
      if (!isCrisis) {
        svg.append('text')
          .attr('x', px-7).attr('y', MT+ai*CH+CH/2)
          .attr('text-anchor','end').attr('dominant-baseline','central')
          .attr('font-size',10.5).attr('fill',C.grayD)
          .text(ag.replace('-Agent','').replace('-Manager','-Mgr'));
      }

      CHANNELS.forEach((ch, ci) => {
        const v    = data[ag][ch];
        const type = isCrisis ? classifyCell(ag, ch) : 'normal';
        const fill = cellFill(ag, ch, isCrisis);
        const cx   = px + ci*CW, cy = MT + ai*CH;

        let highlighted = false;
        if (selectedRound) {
          const sr = rounds.find(r => r.hour === selectedRound);
          if (sr) {
            const srIsCrisis = selectedRound.includes('2046-06-05');
            if (srIsCrisis === isCrisis)
              highlighted = sr.communications.some(c => c.agent_label === ag);
          }
        }

        const rect = svg.append('rect')
          .attr('x',cx+1).attr('y',cy+1)
          .attr('width',CW-2).attr('height',CH-2)
          .attr('rx',3).attr('fill',fill)
          .attr('stroke',
            highlighted ? C.navy :
            type==='oor'   ? C.redD :
            type==='spike' ? '#8a4e00' :
            type==='drop'  ? '#4a6e8a' : C.grayL)
          .attr('stroke-width', highlighted ? 2.5 : type!=='normal' ? 1.5 : 0.5)
          .attr('class','hm-cell')
          .style('cursor', v>0 ? 'pointer' : 'default');

        if (v > 0) {
          svg.append('text')
            .attr('x',cx+CW/2).attr('y',cy+CH/2)
            .attr('text-anchor','middle').attr('dominant-baseline','central')
            .attr('font-size',10.5)
            .attr('font-weight', type!=='normal' ? '700' : '400')
            .attr('fill', (v>60||type!=='normal') ? C.white : C.grayD)
            .text(v);
        }

        rect.on('mouseover', function(event) {
            if (v===0 && type==='normal') return;
            const pv = PRE[ag][ch];
            const anomTxt =
              type==='oor'   ? `<div class="tip-oor">⚠ Out-of-role — zero baseline</div>` :
              type==='spike' ? `<div class="tip-spike">⚠ Spike: ${pv}→${v} (${Math.round(v/Math.max(pv,1))}×)</div>` :
              type==='drop'  ? `<div class="tip-drop">▼ Drop: ${pv}→${v} (${Math.round(v/pv*100)}% of baseline)</div>` : '';
            showTip(`<strong>${ag}</strong><br/>
              Channel: ${CH_LABELS[ch]}<br/>
              Messages: <strong>${v}</strong>${isCrisis?` (baseline: ${pv})`:''}
              ${anomTxt}`, event);
          })
          .on('mousemove', moveTip)
          .on('mouseout', hideTip);
      });
    });
  }

  drawPanel(ML,        PRE,    false, 'Pre-crisis  (May 17 – Jun 4,  13 sessions)');
  drawPanel(ML+PW+40, CRISIS, true,  'Crisis day  (Jun 5,  10 sessions)');

  svg.append('text')
    .attr('x',ML+PW+20).attr('y',MT+AGENTS.length*CH/2)
    .attr('text-anchor','middle').attr('dominant-baseline','central')
    .attr('font-size',13).attr('fill',C.grayL).text('vs');

  [ML, ML+PW+40].forEach(px => {
    for (let ai=0; ai<=AGENTS.length; ai++) {
      svg.append('line')
        .attr('x1',px).attr('x2',px+PW)
        .attr('y1',MT+ai*CH).attr('y2',MT+ai*CH)
        .attr('stroke',C.grayL).attr('stroke-width',0.5);
    }
    for (let ci=0; ci<=CHANNELS.length; ci++) {
      svg.append('line')
        .attr('x1',px+ci*CW).attr('x2',px+ci*CW)
        .attr('y1',MT).attr('y2',MT+AGENTS.length*CH)
        .attr('stroke',C.grayL).attr('stroke-width',0.5);
    }
  });

  const lx = ML+PW*2+40+16, ly = MT;
  svg.append('text').attr('x',lx).attr('y',ly-14)
    .attr('font-size',10).attr('font-weight','600').attr('fill',C.grayD)
    .text('Message count');

  const gradId = 'hm-grad';
  const defs   = svg.append('defs');
  const grad   = defs.append('linearGradient').attr('id',gradId)
    .attr('x1','0%').attr('y1','0%').attr('x2','0%').attr('y2','100%');
  [0,0.25,0.5,0.75,1].forEach(t =>
    grad.append('stop').attr('offset',`${t*100}%`)
      .attr('stop-color', blueScale(maxVal*(1-t))));

  svg.append('rect').attr('x',lx).attr('y',ly)
    .attr('width',14).attr('height',72).attr('fill',`url(#${gradId})`).attr('rx',2);
  svg.append('text').attr('x',lx+18).attr('y',ly+7)
    .attr('font-size',9).attr('fill',C.grayD).text('High');
  svg.append('text').attr('x',lx+18).attr('y',ly+70)
    .attr('font-size',9).attr('fill',C.grayD).text('Low');

  [{col:C.redM,lbl:'Out-of-role post'},
   {col:C.amber,lbl:'Channel spike (≥3×)'},
   {col:C.bluGray,lbl:'Activity drop (≤50%)'}
  ].forEach(({col,lbl},i) => {
    svg.append('rect').attr('x',lx).attr('y',ly+88+i*24)
      .attr('width',14).attr('height',12).attr('fill',col).attr('rx',2);
    svg.append('text').attr('x',lx+18).attr('y',ly+97+i*24)
      .attr('font-size',9).attr('fill',C.grayD).text(lbl);
  });

  document.getElementById('heatmap-legend').innerHTML = `
    <div class="legend-item"><div class="legend-swatch" style="background:${C.redM}"></div>Out-of-role post (zero baseline → nonzero)</div>
    <div class="legend-item"><div class="legend-swatch" style="background:${C.amber}"></div>Channel spike (≥3× increase, ≥10 messages)</div>
    <div class="legend-item"><div class="legend-swatch" style="background:${C.bluGray}"></div>Activity drop (≤50% of baseline, ≥10 decrease)</div>
    <div class="legend-item"><div class="legend-swatch" style="background:${C.blueD}"></div>High activity (blue ramp)</div>
    <div class="legend-item"><div class="legend-swatch" style="background:${C.grayXL};border:1px solid ${C.grayL}"></div>Zero / no messages</div>
  `;
}

function updateHeatmapSelection() {
  document.getElementById('heatmap-container').innerHTML = '';
  buildHeatmap();
}

// ═══════════════════════════════════════════════════════════
//  STEP 3 — ANOMALY BAR CHART
// ═══════════════════════════════════════════════════════════
function buildBarChart() {
  const container = document.getElementById('barchart-container');
  const W  = Math.max(container.clientWidth, 900);
  const H  = 320;
  const ML = 46, MR = 70, MT = 52, MB = 66;
  const chartW = W-ML-MR, chartH = H-MT-MB;

  const PRE_W    = chartW*0.42, CRISIS_W = chartW*0.58;
  const preN=13, crisisN=10;
  const preBarW    = (PRE_W/preN)*0.58;
  const crisisBarW = (CRISIS_W/crisisN)*0.58;

  let pi=0, ci=0;
  const barData = rounds.map(r => {
    const ic  = r.hour.includes('2046-06-05');
    const idx = ic ? ci++ : pi++;
    const bw  = ic ? crisisBarW : preBarW;
    const gap = ic ? CRISIS_W/crisisN : PRE_W/preN;
    const bx  = ML + (ic?PRE_W+18:0) + idx*gap + (gap-bw)/2;
    return { r, ic, bw, bx, count: oorCount(r),
             label: ic ? r.hour.slice(11,16) : r.hour.slice(5,10) };
  });

  const maxCount = d3.max(barData,d=>d.count);
  const yScale   = d3.scaleLinear().domain([0,maxCount+1]).range([chartH,0]);

  function barCol(d) {
    if (!d.ic||d.count===0) return C.blueL;
    if (d.count===1)         return C.amber;
    if (d.count<=3)          return C.red;
    return C.redM;
  }

  const svg = d3.select('#barchart-container').append('svg')
    .attr('width',W).attr('height',H);

  svg.append('text').attr('x',W/2).attr('y',18)
    .attr('text-anchor','middle').attr('font-size',12)
    .attr('font-weight','700').attr('fill',C.navy)
    .text('Step 3 — Anomaly Bar Chart: Out-of-Role Posts per Round');

  svg.append('rect')
    .attr('x',ML+PRE_W+18).attr('y',MT-10)
    .attr('width',CRISIS_W).attr('height',chartH+10)
    .attr('fill',C.redL).attr('rx',4);

  svg.append('text').attr('x',ML+PRE_W/2).attr('y',MT-16)
    .attr('text-anchor','middle').attr('font-size',9.5)
    .attr('font-weight','600').attr('fill',C.grayD)
    .text('Pre-crisis — May 17 to Jun 4 (daily)');
  svg.append('text').attr('x',ML+PRE_W+18+CRISIS_W/2).attr('y',MT-16)
    .attr('text-anchor','middle').attr('font-size',9.5)
    .attr('font-weight','700').attr('fill',C.redM)
    .text('Crisis day — June 5 (hourly)');

  svg.append('g')
    .attr('transform',`translate(${ML},${MT})`)
    .call(d3.axisLeft(yScale).ticks(maxCount+1).tickFormat(d3.format('d')))
    .call(g => g.select('.domain').attr('stroke',C.grayL))
    .call(g => g.selectAll('.tick line').clone()
      .attr('x2',chartW).attr('stroke','#e8e5df').attr('stroke-dasharray','3,3'));

  svg.append('text')
    .attr('transform','rotate(-90)')
    .attr('x',-(MT+chartH/2)).attr('y',15)
    .attr('text-anchor','middle').attr('font-size',9).attr('fill',C.gray)
    .text('Out-of-role posts');

  svg.append('line')
    .attr('x1',ML).attr('x2',ML+chartW)
    .attr('y1',MT+chartH).attr('y2',MT+chartH)
    .attr('stroke',C.red).attr('stroke-width',2)
    .attr('stroke-dasharray','6,3');
  svg.append('text')
    .attr('x',ML+chartW+4).attr('y',MT+chartH)
    .attr('dominant-baseline','central').attr('font-size',8.5).attr('fill',C.red)
    .text('expected = 0');

  barData.forEach(d => {
    const bh  = Math.max(chartH-yScale(d.count), 2);
    const by  = MT+yScale(d.count);
    const sel = d.r.hour === selectedRound;

    const bar = svg.append('rect')
      .attr('x',d.bx).attr('y',by)
      .attr('width',d.bw).attr('height',bh)
      .attr('fill',barCol(d)).attr('rx',2)
      .attr('stroke', sel?C.navy:'none')
      .attr('stroke-width', sel?2.5:0)
      .attr('class','bar-rect').attr('data-hour',d.r.hour)
      .style('cursor','pointer').style('transition','opacity 0.12s');

    if (d.count > 0) {
      svg.append('text')
        .attr('x',d.bx+d.bw/2).attr('y',by-3)
        .attr('text-anchor','middle').attr('font-size',9)
        .attr('font-weight','700').attr('fill',barCol(d))
        .text(d.count);
    }

    svg.append('text')
      .attr('x',d.bx+d.bw/2).attr('y',MT+chartH+13)
      .attr('text-anchor','middle').attr('font-size', d.ic?8.5:7.5)
      .attr('fill', d.ic?C.redM:C.gray)
      .text(d.label);

    bar.on('mouseover', function(event) {
        d3.select(this).style('opacity',0.8);
        const oors = d.r.communications.filter(c=>
          c.channel==='anonymous_post'||
          (c.channel==='personal_post'&&NON_PUBLIC.includes(c.agent_label)));
        showTip(`<strong>${d.r.hour.slice(0,16)}</strong><br/>
          Out-of-role posts: <strong>${d.count}</strong><br/>
          ${d.count>0
            ? oors.map(c=>`<span style="color:${C.redM}">• ${c.agent_label} (${c.channel})</span>`).join('<br/>')
            : `<span style="color:${C.gray}">None — within baseline</span>`}
          <div class="tip-hint">Click to open Round Evidence Panel</div>`, event);
      })
      .on('mousemove', moveTip)
      .on('mouseout', function() { d3.select(this).style('opacity',1); hideTip(); })
      .on('click', function() { hideTip(); selectRound(d.r.hour); });
  });

  document.getElementById('barchart-legend').innerHTML = `
    <div class="legend-item"><div class="legend-swatch" style="background:${C.blueL};border:1px solid ${C.grayL}"></div>Zero (baseline)</div>
    <div class="legend-item"><div class="legend-swatch" style="background:${C.amber}"></div>Low deviation (1)</div>
    <div class="legend-item"><div class="legend-swatch" style="background:${C.red}"></div>High deviation (2–3)</div>
    <div class="legend-item"><div class="legend-swatch" style="background:${C.redM}"></div>Breach level (4+)</div>
    <div class="legend-item" style="gap:6px;"><div style="width:24px;height:2px;background:${C.red};border-top:2px dashed ${C.red};flex-shrink:0;margin-top:5px;"></div>Expected baseline (0)</div>
  `;
}

function updateBarSelection() {
  d3.selectAll('.bar-rect').each(function() {
    const sel = this.getAttribute('data-hour') === selectedRound;
    d3.select(this).attr('stroke',sel?C.navy:'none').attr('stroke-width',sel?2.5:0);
  });
}

// ═══════════════════════════════════════════════════════════
//  ROUND EVIDENCE PANEL
// ═══════════════════════════════════════════════════════════
function setEvidenceMode(mode) {
  evidenceMode = mode;
  document.getElementById('btn-anomalies').classList.toggle('active', mode==='anomalies');
  document.getElementById('btn-all').classList.toggle('active', mode==='all');
  renderEvidenceBody();
}

function renderEvidence() {
  const placeholder = document.getElementById('evidence-placeholder');
  const content     = document.getElementById('evidence-content');

  if (!selectedRound) {
    placeholder.style.display = 'block';
    content.style.display     = 'none';
    return;
  }
  placeholder.style.display = 'none';
  content.style.display     = 'block';

  const r = rounds.find(x => x.hour === selectedRound);
  if (!r) return;

  const isCrisis  = selectedRound.includes('2046-06-05');
  const headerCol = isCrisis ? C.redM : C.blueD;
  const oor = r.communications.filter(c=>
    c.channel==='anonymous_post'||
    (c.channel==='personal_post'&&NON_PUBLIC.includes(c.agent_label)));

  document.getElementById('ev-header').style.background = headerCol;
  document.getElementById('ev-header').innerHTML = `
    <div>
      <span class="ev-round">Round: ${selectedRound.slice(0,16)}</span>
      <span class="ev-badge">${isCrisis?'Crisis day':'Pre-crisis'}</span>
    </div>
    <div class="ev-count">Out-of-role posts this round: <strong>${oor.length}</strong></div>
  `;

  const env = r.environment_context;
  let envHtml = `<div class="ev-env-label">Environment context</div>
    <div style="margin-bottom:10px;">${env.event_narrative||'No narrative recorded for this round.'}</div>`;

  if (env.market_snapshot) {
    const m = env.market_snapshot;
    envHtml += `<div style="font-size:11.5px;color:${C.grayD};margin-bottom:8px;">
      <strong>Market:</strong> ${m.stock_price||''} (${m.percent_change||''}) ·
      sentiment: ${m.sentiment||''}
      ${m.trending_hashtags?.length ? ` · trending: ${m.trending_hashtags.join(', ')}` : ''}
    </div>`;
  }

  if (env.external_actor_actions?.length) {
    envHtml += `<div style="font-size:11.5px;margin-bottom:8px;">
      <strong>External actors:</strong>
      <ul style="margin:4px 0 0 18px;padding:0;">
        ${env.external_actor_actions.map(a => `<li>${a}</li>`).join('')}
      </ul>
    </div>`;
  }

  if (env.social_manager_alerts?.length) {
    envHtml += `<div style="font-size:11.5px;margin-bottom:8px;">
      <strong>Social alerts:</strong>
      <ul style="margin:4px 0 0 18px;padding:0;">
        ${env.social_manager_alerts.map(a => `<li>${a}</li>`).join('')}
      </ul>
    </div>`;
  }

  if (env.agents_unavailable?.length) {
    envHtml += `<div style="font-size:11.5px;color:${C.redM};margin-bottom:8px;">
      <strong>Agents unavailable this round:</strong> ${env.agents_unavailable.join(', ')}
    </div>`;
  }

  if (env.critical_deadlines?.length) {
    envHtml += `<div style="font-size:11.5px;color:${C.amber};">
      <strong>Critical deadlines:</strong>
      <ul style="margin:4px 0 0 18px;padding:0;">
        ${env.critical_deadlines.map(d => `<li>${d}</li>`).join('')}
      </ul>
    </div>`;
  }

  document.getElementById('ev-env').innerHTML = envHtml;

  renderEvidenceBody();

  document.getElementById('evidence-panel')
    .scrollIntoView({behavior:'smooth', block:'nearest'});
}

function renderEvidenceBody() {
  if (!selectedRound) return;
  const r = rounds.find(x => x.hour === selectedRound);
  if (!r) return;
  const isCrisis  = selectedRound.includes('2046-06-05');
  const headerCol = isCrisis ? C.redM : C.blueD;
  const body      = document.getElementById('ev-body');
  evidenceMode === 'anomalies'
    ? renderAnomaliesMode(r, isCrisis, headerCol, body)
    : renderAllMessagesMode(r, body);
}

function renderAnomaliesMode(r, isCrisis, headerCol, body) {
  const oor = r.communications.filter(c=>
    c.channel==='anonymous_post'||
    (c.channel==='personal_post'&&NON_PUBLIC.includes(c.agent_label)));

  const isTimelineNav = highlightedHour === selectedRound;
  let html = '';

  if (oor.length > 0) {
    html += `<div class="ev-section-label" style="color:${headerCol}">Out-of-role posts</div>`;
    oor.forEach(c => {
      html += `<div class="oor-post" style="${isTimelineNav ? `
        border:2px solid ${C.amber};
        border-left:4px solid ${C.amber};
        box-shadow:0 0 0 3px ${C.amberL},0 2px 8px rgba(0,0,0,0.12);
        background:#FFFDF5;
      ` : ''}">
        <div class="oor-meta">
          <span class="oor-agent">${c.agent_label}</span>
          <span class="oor-channel">${c.channel}</span>
          ${isTimelineNav ? `<span style="
            font-size:10px;background:${C.amber};color:white;
            border-radius:3px;padding:1px 7px;font-weight:600;
          ">↑ From timeline</span>` : ''}
        </div>
        <div class="oor-content">${c.content}</div>
      </div>`;
    });
  } else {
    html += `<div class="no-data">No out-of-role posts this round — behavior within baseline.</div>`;
  }

  const oorAgents = new Set(oor.map(c=>c.agent_label));
  const byAgent   = {};
  r.communications.forEach(c => {
    if (!byAgent[c.agent_label]) byAgent[c.agent_label] = [];
    byAgent[c.agent_label].push(c);
  });

  const blocks = Object.entries(byAgent).map(([ag, comms]) => {
    let best = comms.filter(c=>c.internal_state?.deliberating)
      .sort((a,b)=>(b.internal_state.deliberating?.length||0)-(a.internal_state.deliberating?.length||0))[0];
    if (!best) best = comms.filter(c=>c.internal_state?.rationalizing)
      .sort((a,b)=>(b.internal_state.rationalizing?.length||0)-(a.internal_state.rationalizing?.length||0))[0];
    if (!best) best = comms.filter(c=>c.internal_state?.reacting)
      .sort((a,b)=>(b.internal_state.reacting?.length||0)-(a.internal_state.reacting?.length||0))[0];
    if (!best||!best.internal_state) return null;
    const ist  = best.internal_state;
    const type = ist.deliberating?'deliberating':ist.rationalizing?'rationalizing':'reacting';
    return { ag, ist, type, isOor: oorAgents.has(ag) };
  }).filter(Boolean);

  if (blocks.length > 0) {
    html += `<div class="ev-section-label" style="margin-top:16px">Agent reasoning this round</div>`;
    if (blocks.some(b=>b.type!=='deliberating') && isCrisis) {
      html += `<div style="font-size:11.5px;color:${C.redM};margin-bottom:10px;font-style:italic;">
        Note: deliberation logging drops in crisis hours — some agents show partial reasoning only. This shift is itself analytically significant.
      </div>`;
    }
    blocks.forEach(({ag, ist, type, isOor}, blockIdx) => {
      const cardHighlight = isTimelineNav && !oor.length && blockIdx === 0;
      html += `<div class="agent-card ${isOor?'is-oor':''}" style="${cardHighlight?`border:2px solid ${C.amber};box-shadow:0 0 0 3px ${C.amberL};`:''}">
        <div class="agent-card-header">
          <div><span class="ac-name">${ag}</span><span class="ac-type">${type} only</span></div>
          ${isOor?`<span class="ac-oor-tag">Out-of-role this round</span>`:''}
        </div>
        <div class="agent-card-body">`;
      if (ist.reacting)      html += `<div class="reasoning-field"><div class="rf-label">Reacting to</div><div class="rf-text">${ist.reacting}</div></div>`;
      if (ist.rationalizing) html += `<div class="reasoning-field"><div class="rf-label">Rationalizing</div><div class="rf-text">${ist.rationalizing}</div></div>`;
      if (ist.deliberating)  html += `<div class="reasoning-field">
        <div class="rf-label" style="${isOor?`color:${headerCol}`:''}">Deliberating</div>
        <div class="rf-text" style="${isOor?`border-left:2px solid ${headerCol};padding-left:8px`:''}">${ist.deliberating}</div>
      </div>`;
      html += `</div></div>`;
    });
  } else {
    html += `<div class="no-data" style="margin-top:12px;">No internal reasoning recorded for this round. The absence of deliberation in crisis hours is itself an analytically significant finding.</div>`;
  }

  body.innerHTML = html;
}

function renderAllMessagesMode(r, body) {
  const byAgent = {};
  r.communications.forEach(c => {
    if (!byAgent[c.agent_label]) byAgent[c.agent_label] = [];
    byAgent[c.agent_label].push(c);
  });

  const isOorAgent = (ag, comms) => comms.some(c =>
    c.channel === 'anonymous_post' ||
    (c.channel === 'personal_post' && NON_PUBLIC.includes(ag))
  );

  let html = `<div style="font-size:12px;color:${C.gray};margin-bottom:14px;">
    All ${r.communications.length} communications from this session, grouped by agent.
    Out-of-role agents are highlighted with a red border.
  </div>`;

  Object.entries(byAgent).forEach(([ag, comms]) => {
    const isOor      = isOorAgent(ag, comms);
    const borderCol  = isOor ? C.redM : C.grayL;
    const headerBg   = isOor ? '#FEF0F0' : C.navy;
    const headerTxt  = isOor ? C.redM    : C.white;
    const subTxtCol  = isOor ? C.redM    : '#9DB8C8';

    const oorMsgs    = comms.filter(c =>
      c.channel === 'anonymous_post' ||
      (c.channel === 'personal_post' && NON_PUBLIC.includes(ag))
    ).length;
    const normalMsgs = comms.length - oorMsgs;
    const countLabel = isOor
      ? `${comms.length} message${comms.length>1?'s':''} (${normalMsgs} normal, ${oorMsgs} out-of-role)`
      : `${comms.length} message${comms.length>1?'s':''}`;

    html += `<div style="
      margin-bottom:16px;
      border:1.5px solid ${borderCol};
      border-radius:8px;
      overflow:hidden;
      box-shadow:0 1px 4px rgba(0,0,0,0.07);
    ">
      <div style="
        background:${headerBg};
        padding:9px 14px;
        display:flex;
        align-items:center;
        gap:8px;
        border-bottom:1.5px solid ${borderCol};
      ">
        <span style="font-size:13px;font-weight:700;color:${headerTxt};">${ag}</span>
        <span style="font-size:10px;color:${subTxtCol};font-style:italic;">
          ${countLabel}
        </span>
        ${isOor ? `<span style="
          font-size:10px;background:${C.redM};color:white;
          border-radius:3px;padding:1px 8px;font-weight:600;margin-left:auto;
        ">Out-of-role this round</span>` : ''}
      </div>`;

    comms.forEach((c, msgIdx) => {
      const rowBg = msgIdx % 2 === 0 ? C.white : C.offwhite;
      const isMsgOor = c.channel === 'anonymous_post' ||
      (c.channel === 'personal_post' && NON_PUBLIC.includes(ag));
    html += `<div style="
      padding:8px 14px;
      background:${isMsgOor ? '#FEF0F0' : rowBg};
      border-bottom:1px solid ${C.grayL};
      border-left:${isMsgOor ? `3px solid ${C.redM}` : 'none'};
      font-size:12px;
    ">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;flex-wrap:wrap;">
        <span class="msg-channel ${c.channel}">${CH_LABELS[c.channel]||c.channel}</span>
        ${isMsgOor ? `<span style="
          font-size:10px;background:${C.redM};color:white;
          border-radius:3px;padding:1px 6px;font-weight:600;
        ">out-of-role</span>` : ''}
        ${c.recipients?.length?`<span style="font-size:10px;color:${C.gray};">→ ${c.recipients.join(', ')}</span>`:''}
      </div>
      <div style="color:${C.text};line-height:1.6;">${c.content}</div>
    </div>`;
    });

    html += `</div>`;
  });

  body.innerHTML = html;
}

// ═══════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════
fetch('MC1_final_00.json')
  .then(res => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  })
  .then(data => {
    rounds = data.rounds;
    const preRounds    = rounds.filter(r => !r.hour.includes('2046-06-05'));
    const crisisRounds = rounds.filter(r =>  r.hour.includes('2046-06-05'));
    PRE    = msgCounts(preRounds);
    CRISIS = msgCounts(crisisRounds);

    document.getElementById('loading').style.display      = 'none';
    document.getElementById('main-content').style.display = 'block';

    const sel = document.getElementById('round-select');
    rounds.forEach(r => {
      const ic  = r.hour.includes('2046-06-05');
      const lbl = ic
        ? `Crisis day — June 5,  ${r.hour.slice(11,16)}`
        : `Pre-crisis — ${r.hour.slice(0,10)}`;
      const opt = document.createElement('option');
      opt.value       = r.hour;
      opt.textContent = lbl;
      if (ic) opt.style.color = '#E24B4A';
      sel.appendChild(opt);
    });

    sel.addEventListener('change', function() {
      selectedRound   = this.value || null;
      if (!selectedRound) highlightedHour = null;
      syncAll();
    });

    buildTimeline();
    buildHeatmap();
    buildBarChart();
  })
  .catch(err => {
    document.getElementById('loading').innerHTML = `
      <div style="color:#A32D2D;font-size:14px;">
        <strong>Could not load dataset.</strong><br/>
        ${err.message}<br/><br/>
        <span style="font-size:12px;color:#888;">
          Make sure MC1_final_00.json is in the same folder and you are running
          via a local server (e.g. <code>python3 -m http.server 8000</code>)
          rather than opening the file directly.
        </span>
      </div>`;
  });
