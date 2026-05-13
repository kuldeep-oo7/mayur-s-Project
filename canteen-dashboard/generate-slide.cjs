// generate-slide.cjs  — run with: node generate-slide.cjs
const PptxGenJS = require('pptxgenjs');
const pptx = new PptxGenJS();

pptx.layout = 'LAYOUT_WIDE'; // 13.33 x 7.5 in (16:9)

// ─── Brand colours ──────────────────────────────────────────────────────────
const NAVY   = '0A1628';
const BLUE   = '2563EB';
const CYAN   = '06B6D4';
const AMBER  = 'F59E0B';
const WHITE  = 'FFFFFF';
const LGRAY  = 'F1F5F9';
const MGRAY  = '94A3B8';

const slide = pptx.addSlide();

// ════════════════════════════════════════════════════════════════════════════
// BACKGROUND — full navy canvas
// ════════════════════════════════════════════════════════════════════════════
slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: '100%', h: '100%', fill: { color: NAVY } });

// Left vivid accent bar
slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.07, h: '100%', fill: { color: BLUE } });

// Top-right cyan glow ellipse (decorative)
slide.addShape(pptx.ShapeType.ellipse, {
  x: 10.8, y: -1.2, w: 4, h: 4,
  fill: { color: CYAN, transparency: 88 },
  line: { color: CYAN, transparency: 95, width: 0 }
});

// ════════════════════════════════════════════════════════════════════════════
// HEADER BAND
// ════════════════════════════════════════════════════════════════════════════
slide.addShape(pptx.ShapeType.rect, { x: 0.07, y: 0, w: 13.26, h: 1.35, fill: { color: '0D1F3C' } });

// Logo pill
slide.addShape(pptx.ShapeType.roundRect, {
  x: 0.28, y: 0.22, w: 1.7, h: 0.58,
  fill: { color: BLUE }, rectRadius: 0.12
});
slide.addText('CaféOps', {
  x: 0.28, y: 0.22, w: 1.7, h: 0.58,
  fontSize: 14, bold: true, color: WHITE, align: 'center', valign: 'middle'
});

// Header title
slide.addText('Sponsorship & Collaboration Opportunity', {
  x: 2.2, y: 0.18, w: 7.5, h: 0.5,
  fontSize: 13, bold: false, color: MGRAY, align: 'left'
});
slide.addText('Canteen Innovation Events 2026', {
  x: 2.2, y: 0.62, w: 7.5, h: 0.52,
  fontSize: 18, bold: true, color: WHITE, align: 'left'
});

// Confidential badge (top-right)
slide.addShape(pptx.ShapeType.roundRect, {
  x: 11.6, y: 0.3, w: 1.55, h: 0.42,
  fill: { color: AMBER, transparency: 15 }, rectRadius: 0.1
});
slide.addText('CONFIDENTIAL', {
  x: 11.6, y: 0.3, w: 1.55, h: 0.42,
  fontSize: 7.5, bold: true, color: NAVY, align: 'center', valign: 'middle'
});

// ════════════════════════════════════════════════════════════════════════════
// HERO TAGLINE (centre-left)
// ════════════════════════════════════════════════════════════════════════════
slide.addText("Let's Build the\nFuture of Canteen\nManagement Together", {
  x: 0.38, y: 1.52, w: 4.6, h: 2.3,
  fontSize: 26, bold: true, color: WHITE,
  lineSpacingMultiple: 1.18, align: 'left'
});
// Cyan underline accent
slide.addShape(pptx.ShapeType.rect, { x: 0.38, y: 3.86, w: 1.1, h: 0.07, fill: { color: CYAN } });

slide.addText(
  'We are launching a series of corporate canteen events designed to drive\n' +
  'cost savings, vendor innovation & food quality. Your brand gets premium\n' +
  'visibility to 500 + corporate canteen decision-makers across India.',
  {
    x: 0.38, y: 4.04, w: 4.55, h: 1.5,
    fontSize: 10, color: 'A8BFDA', lineSpacingMultiple: 1.45, align: 'left'
  }
);

// ════════════════════════════════════════════════════════════════════════════
// EVENT CARDS  (3 cards, centre column)
// ════════════════════════════════════════════════════════════════════════════
const events = [
  { icon: '🏆', title: 'Vendor Innovation Summit', date: 'Sep 2026', desc: 'Showcase emerging food vendors & procurement tech' },
  { icon: '📊', title: 'Cost Intelligence Forum',  date: 'Nov 2026', desc: 'CFO-level discussion on canteen spend analytics'  },
  { icon: '🤝', title: 'Canteen Leaders Conclave', date: 'Jan 2027', desc: 'Cross-industry benchmarking & best-practice awards' },
];

events.forEach((ev, i) => {
  const x = 5.25 + i * 2.66;
  // Card bg
  slide.addShape(pptx.ShapeType.roundRect, {
    x, y: 1.48, w: 2.48, h: 3.12,
    fill: { color: '0F2744' }, rectRadius: 0.14,
    line: { color: '1E3A5F', width: 0.8 }
  });
  // Top accent strip
  const stripColors = [BLUE, CYAN, AMBER];
  slide.addShape(pptx.ShapeType.roundRect, {
    x, y: 1.48, w: 2.48, h: 0.22,
    fill: { color: stripColors[i] }, rectRadius: 0.14
  });
  // Emoji icon circle
  slide.addShape(pptx.ShapeType.ellipse, {
    x: x + 0.85, y: 1.88, w: 0.78, h: 0.78,
    fill: { color: '132B4A' }
  });
  slide.addText(ev.icon, {
    x: x + 0.85, y: 1.9, w: 0.78, h: 0.72,
    fontSize: 22, align: 'center', valign: 'middle'
  });
  // Date badge
  slide.addShape(pptx.ShapeType.roundRect, {
    x: x + 0.55, y: 2.74, w: 1.38, h: 0.3,
    fill: { color: stripColors[i], transparency: 80 }, rectRadius: 0.08
  });
  slide.addText(ev.date, {
    x: x + 0.55, y: 2.74, w: 1.38, h: 0.3,
    fontSize: 8, bold: true, color: WHITE, align: 'center', valign: 'middle'
  });
  // Title
  slide.addText(ev.title, {
    x: x + 0.14, y: 3.12, w: 2.2, h: 0.56,
    fontSize: 10, bold: true, color: WHITE, align: 'center', lineSpacingMultiple: 1.2
  });
  // Description
  slide.addText(ev.desc, {
    x: x + 0.14, y: 3.7, w: 2.2, h: 0.72,
    fontSize: 8.5, color: '7A9BC0', align: 'center', lineSpacingMultiple: 1.3
  });
});

// ════════════════════════════════════════════════════════════════════════════
// SPONSORSHIP TIERS  (bottom strip)
// ════════════════════════════════════════════════════════════════════════════
slide.addShape(pptx.ShapeType.rect, {
  x: 0.07, y: 4.72, w: 13.26, h: 0.08, fill: { color: '1E3A5F' }
});

slide.addText('SPONSORSHIP TIERS', {
  x: 0.38, y: 4.88, w: 3, h: 0.3,
  fontSize: 8, bold: true, color: CYAN, align: 'left'
});

const tiers = [
  { name: 'TITLE', color: AMBER,  price: '₹25L', perks: 'Logo on all assets · Keynote slot · 10 passes' },
  { name: 'GOLD',  color: '22C55E', price: '₹15L', perks: 'Logo on stage · Panel seat · 6 passes'        },
  { name: 'SILVER',color: '64748B', price: '₹8L',  perks: 'Booth · Brand mention · 3 passes'             },
  { name: 'DIGITAL',color: CYAN,   price: '₹3L',  perks: 'App banner · Social media · E-cert'            },
];

tiers.forEach((t, i) => {
  const x = 0.38 + i * 3.22;
  slide.addShape(pptx.ShapeType.roundRect, {
    x, y: 5.26, w: 3.05, h: 1.76,
    fill: { color: '0D1F3C' }, rectRadius: 0.1,
    line: { color: t.color, width: 1 }
  });
  // Tier name + price row
  slide.addShape(pptx.ShapeType.roundRect, {
    x: x + 0.12, y: 5.38, w: 0.78, h: 0.3,
    fill: { color: t.color, transparency: 20 }, rectRadius: 0.06
  });
  slide.addText(t.name, {
    x: x + 0.12, y: 5.38, w: 0.78, h: 0.3,
    fontSize: 7.5, bold: true, color: WHITE, align: 'center', valign: 'middle'
  });
  slide.addText(t.price, {
    x: x + 1.0, y: 5.36, w: 1.92, h: 0.34,
    fontSize: 16, bold: true, color: t.color, align: 'right', valign: 'middle'
  });
  // Perks
  slide.addText(t.perks, {
    x: x + 0.14, y: 5.76, w: 2.76, h: 0.82,
    fontSize: 8.5, color: '8BAFC9', lineSpacingMultiple: 1.5, align: 'left'
  });
});

// ════════════════════════════════════════════════════════════════════════════
// FOOTER
// ════════════════════════════════════════════════════════════════════════════
slide.addShape(pptx.ShapeType.rect, {
  x: 0.07, y: 7.12, w: 13.26, h: 0.38, fill: { color: '060E1D' }
});
slide.addText('📧  partnerships@cafeops.in   |   📞  +91 98765 43210   |   🌐  cafeops.in/events', {
  x: 0.38, y: 7.14, w: 8.5, h: 0.34,
  fontSize: 8.5, color: '4A6FA5', align: 'left', valign: 'middle'
});
slide.addText('© 2026 CaféOps Technologies Pvt. Ltd.  All rights reserved.', {
  x: 8.9, y: 7.14, w: 4.2, h: 0.34,
  fontSize: 7.5, color: '2D4A6A', align: 'right', valign: 'middle'
});

// ════════════════════════════════════════════════════════════════════════════
// RIGHT PANEL — REVENUE & IMPACT STATS
// ════════════════════════════════════════════════════════════════════════════
// Thin divider
slide.addShape(pptx.ShapeType.rect, {
  x: 5.12, y: 1.52, w: 0.04, h: 3.12, fill: { color: '1E3A5F' }
});

// Stats column (inside hero area — bottom left)
const stats = [
  { val: '500+', label: 'Corporate Canteen\nDecision-Makers' },
  { val: '3',    label: 'Premium Events\nAcross India'       },
  { val: '₹51L', label: 'Total Sponsorship\nInventory'       },
];
stats.forEach((s, i) => {
  const y = 1.54 + i * 0.82;
  slide.addText(s.val, {
    x: 0.38, y, w: 1.2, h: 0.4,
    // place stats below tagline — push them to right-edge of left panel
  });
});
// Actually place the stats as a row below the hero copy
const statY = 5.55;
stats.forEach((s, i) => {
  const sx = 0.38 + i * 1.56;
  slide.addText(s.val, {
    x: sx, y: statY, w: 1.42, h: 0.52,
    fontSize: 22, bold: true, color: CYAN, align: 'left'
  });
  slide.addText(s.label, {
    x: sx, y: statY + 0.5, w: 1.42, h: 0.48,
    fontSize: 7.5, color: MGRAY, align: 'left', lineSpacingMultiple: 1.25
  });
});

// ════════════════════════════════════════════════════════════════════════════
// CTA BUTTON  (bottom-right of hero)
// ════════════════════════════════════════════════════════════════════════════
slide.addShape(pptx.ShapeType.roundRect, {
  x: 0.38, y: 4.46, w: 2.2, h: 0.46,
  fill: { color: BLUE }, rectRadius: 0.1
});
slide.addText('Book a Sponsor Meeting →', {
  x: 0.38, y: 4.46, w: 2.2, h: 0.46,
  fontSize: 9.5, bold: true, color: WHITE, align: 'center', valign: 'middle'
});

// ════════════════════════════════════════════════════════════════════════════
// SAVE
// ════════════════════════════════════════════════════════════════════════════
pptx.writeFile({ fileName: 'CafeOps-Sponsorship-Deck.pptx' })
  .then(() => console.log('✅  CafeOps-Sponsorship-Deck.pptx saved'))
  .catch(e => console.error(e));
