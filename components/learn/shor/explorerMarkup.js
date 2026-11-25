// components/learn/shor/explorerMarkup.js
//
// The explorer's static markup, from the thesis mockup. explorerEngine.js fills it in.

export const EXPLORER_MARKUP = `
<p class="lede">Pick a number to factor. The algorithm picks its own base a, retrying when one fails, then you step through the circuit one gate at a time. Click any gate to see what it does and what is inside it.</p>

<div class="controls">
<div class="field"><label for="selN">Number to factor, N</label><select id="selN"><option>15</option><option>21</option><option>33</option><option>35</option><option selected>55</option><option>77</option><option>91</option><option>143</option><option>221</option></select></div>
<div class="field"><label for="selSrc">Measurements from</label><select id="selSrc"><option value="sim">Perfect simulator</option><option value="hw" id="optHw">IBM hardware</option></select></div>
<div class="field"><label for="fileHw">IBM results file</label><input type="file" id="fileHw" accept=".json,application/json"></div>
<button id="bRun" class="primary">Run again</button>
</div>
<p class="setup" id="setup"></p>
<p class="srcnote" id="srcNote" hidden></p>
<div class="panel runs">
<h2>The algorithm's attempts</h2>
<p class="sub" style="margin:2px 0 10px">Shor's picks a random base a, checks it classically, and runs the circuit only if needed. If the result can't be used, it starts over with a new a. Select an attempt to see its circuit below.</p>
<ol class="att" id="att"></ol>
</div>
<p class="circnote" id="circNote"></p>

<div class="panel circ-panel">
<div class="scroll"><svg class="circ" id="circ" tabindex="0" role="img" aria-label="Shor's algorithm circuit with playhead"></svg></div>
<div class="transport">
<button id="bPrev" aria-label="Previous step">Back</button>
<button id="bPlay" class="primary">Play</button>
<button id="bNext" aria-label="Next step">Next</button>
<input type="range" id="scrub" min="0" value="0" aria-label="Playhead position">
<span class="stepname" id="stepName"></span>
</div>
</div>


<div class="panel detail" id="detail" hidden>
<div class="ph"><h2 id="dTitle"></h2><button id="dClose">Close</button></div>
<div id="dBody"></div>
</div>
<div class="now" id="now"></div>
<div class="panel math">
<h2 id="mathTitle">From the measurement to the factors</h2>
<div id="math"></div>
</div>

<div class="panel chipp" id="chipP">
<div class="ph"><h2>What the chip actually runs</h2><button id="bChip" aria-expanded="false" aria-controls="chipBody">Show it</button></div>
<p class="sub" style="margin:2px 0 0;max-width:80ch">The circuit above is the textbook version. A real chip can't run ×7 or QFT† as single gates. This is the circuit IBM's ibm_kingston actually ran for N = 15, a = 7, after Qiskit translated it for that chip.</p>
<div id="chipBody" hidden>
<div class="tiles">
<div class="tile2"><b>4</b><span>kinds of gate. The chip knows only rz, sx, x and cz.</span></div>
<div class="tile2"><b>12 of 156</b><span>qubits used on the chip</span></div>
<div class="tile2"><b>1,249</b><span>gates in total, 288 of them two-qubit (cz)</span></div>
<div class="tile2 hot"><b>30 swaps</b><span>90 of the 288 cz gates (31%) only move data between neighbors</span></div>
</div>
<h3>Where it ran on the chip</h3>
<p class="sub" style="max-width:80ch">Each dot is a qubit and each line is a wire between two neighbors. A two-qubit gate only works across one of these lines. The 12 qubits this circuit used are numbered; thicker lines carried more cz gates.</p>
<div class="scroll"><svg id="chipMap" role="img" aria-label="ibm_kingston qubit map with the 12 qubits this circuit used highlighted"></svg></div>
<div class="legend chiplg"><span class="dotk ink"></span>counting qubit (c0 to c7, measured) <span class="dotk work"></span>work qubit (holds y, never measured) <span class="dotk off"></span>unused</div>
<h3>Every gate, in order</h3>
<div class="chipctl">
<div class="seg" role="group" aria-label="Zoom"><button id="zWhole" aria-pressed="true">Whole circuit</button><button id="zIn" aria-pressed="false">Zoom in</button></div>
<label class="chk"><input type="checkbox" id="hlSwap" checked> Highlight swaps</label>
</div>
<p class="sub" style="max-width:80ch;margin:0 0 6px">One row per qubit, in chip order, so qubits that are neighbors on the chip sit next to each other. Hover any gate to see what it is. Orange shows the swaps. Each row is labeled with what it holds when it is measured; the swaps move values from qubit to qubit along the way.</p>
<div class="scroll" id="cmpScroll"><svg id="cmpCirc" role="img" aria-label="The compiled circuit, every gate on every physical qubit"></svg></div>
<ul class="gkey">
<li><b>rz(θ)</b> spins one qubit's phase by the angle θ. It costs nothing on IBM chips: it is done in software.</li>
<li><b>sx</b> is half of a bit flip (√X). Two in a row make one x.</li>
<li><b>x</b> flips 0 and 1.</li>
<li><b>cz</b> flips the sign when both qubits are 1. It is the only two-qubit gate, and the noisiest one, which is why the scaling panel counts these.</li>
<li><span class="swk"></span><b>swap</b> (orange) is three cz gates with sx between them. It trades two neighbors' values so that qubits that need to interact end up side by side.</li>
</ul>
<p class="same"><b>Same answer.</b> We ran these 1,249 gates on a perfect simulator. They give exactly the textbook result: four peaks, at x = 0, 64, 128 and 192, each 25% likely. Every gate in the textbook circuit has been rebuilt from these four kinds of gate.</p>
<details class="qasm"><summary>Show the file IBM ran (OpenQASM 3)</summary><pre id="qasmTxt"></pre></details>
</div>
</div>

<div class="panel scale" id="scale">
<h2>Why quantum wins eventually</h2>
<p class="finding" id="scHead"></p>
<div class="scctl">
<label for="scBits" class="flabel">Size of the number: <b id="scBitsVal"></b></label>
<input type="range" id="scBits" min="2" max="11" step="0.01" value="11">
<div class="scpre" role="group" aria-label="Preset sizes">
<button data-b="4">N = 15 (4 bits)</button><button data-b="6">N = 55 (6 bits)</button><button data-b="32">32 bits</button><button data-b="829">RSA-250 (829 bits)</button><button data-b="2048">RSA-2048</button>
</div>
</div>
<div class="fig" id="scWrap"><svg id="scFig" role="img" aria-label="Operations needed to factor a number, by size"></svg></div>
<ol class="sckey">
<li><span class="mk on">1</span>N = 15 ran on IBM's Kingston chip: about 250 gates, clear peaks.</li>
<li><span class="mk">2</span>Our N = 55 circuit on the same chip: about 101,000 gates. That is far above the Shor's line (an ideal circuit would need a few hundred) and far above what today's chips can run, so it gave only noise.</li>
<li><span class="mk on">3</span>RSA-250 (829 bits): factored classically, using a supercomputer.</li>
<li><span class="mk">4</span>RSA-2048: Google's estimate for Shor's, under a week (not yet possible).</li>
<li><span class="band" aria-hidden="true"></span>What today's chips can run, measured on three IBM chips (24 Nov 2026): the peaks fade to near-noise somewhere between about 1,200 and 2,200 two-qubit gates (the darker strip), depending on the chip and the day. Anything above the strip gives only noise.</li>
</ol>
<div class="scroll"><table class="sct" id="scTab"></table></div>
<p class="sub" style="margin-top:10px">Rough growth rates with constants left out, so read the gaps between the lines, not exact counts. Trial division: about 2<sup>n/2</sup> divisions. Best classical (general number field sieve): about exp(1.92 · (ln N)<sup>1/3</sup> (ln ln N)<sup>2/3</sup>) operations; its time column is scaled so that RSA-250 costs what it really did. Shor's: about n<sup>3</sup> logical gate steps (schoolbook arithmetic), before the large overhead of error correction. Dots are real: our compiled circuits on ibm_kingston, the RSA-250 classical record (an 829-bit number, factored using a 32-million-core-hour allocation on the JUWELS supercomputer), and Google's 2025 estimate that a 2048-bit RSA number could be factored in under a week with under a million noisy qubits.</p>
</div>

<p class="foot">Mockup on the georgelake2 fork: the Shor's explorer as its own Redux page. Measurements come from a perfect simulator or from saved IBM runs; nothing here calls the backend yet.</p>
`;
