/* hbar.ink — physicist symbol layer: DATA.
 *
 * Lifted verbatim from the reference prototype
 *   experiments/physicist-keyboard/index.html  (hbar.world, 2026-05-19)
 * per the governance decision that this is an ink input layer, not a system.
 *
 * Data + the search ranking only — no UI, no editor glue. The integration
 * (inline completion, palette panel, Greek mode) lives in main.js.
 * Exposed as window.HBARPhysics.
 */
(() => {
  'use strict'

  /* ===== physical-key → symbol map (drives Greek mode + the keyboard layout) ===== */
  const physicalMap = {
    "`":"ℏ",
    "1":"¹","2":"²","3":"³","4":"⁴","5":"⁵","6":"⁶","7":"⁷","8":"⁸","9":"⁹","0":"⁰",
    "-":"−","=":"≈",
    q:"θ", w:"ω", e:"ε", r:"ρ", t:"τ", y:"ψ", u:"υ", i:"ι", o:"ο", p:"π",
    "[":"⟨", "]":"⟩",
    a:"α", s:"σ", d:"δ", f:"φ", g:"γ", h:"η", j:"ϑ", k:"κ", l:"λ",
    ";":"∂", "'":"∇",
    z:"ζ", x:"ξ", c:"χ", v:"ϖ", b:"β", n:"ν", m:"μ",
    ",":"⋅", ".":"∫", "/":"√"
  }
  /* uppercase Greek when Shift is held */
  const greekUpper = {
    c:"Χ", d:"Δ", f:"Φ", g:"Γ", j:"Θ", l:"Λ", p:"Π", q:"Θ",
    s:"Σ", w:"Ω", x:"Ξ", y:"Ψ"
  }

  /* ===== short explanation cards (Descriptions mode) ===== */
  const desc = {
    /* Greek lowercase */
    "α":{n:"alpha",d:"Fine-structure constant; angular acceleration; an alpha particle."},
    "β":{n:"beta",d:"Speed as a fraction of light, v/c; a beta particle; 1/kT in thermodynamics."},
    "γ":{n:"gamma",d:"The Lorentz factor 1/√(1−β²); a photon; heat-capacity ratio Cₚ/Cᵥ."},
    "δ":{n:"delta",d:"A tiny change; the Dirac and Kronecker deltas; a variation."},
    "ε":{n:"epsilon",d:"Permittivity; a vanishingly small quantity; strain; the Levi-Civita symbol."},
    "ζ":{n:"zeta",d:"The Riemann zeta function; the damping ratio of an oscillator."},
    "η":{n:"eta",d:"Efficiency; dynamic viscosity; the flat Minkowski metric η_μν."},
    "θ":{n:"theta",d:"An angle; the polar angle in spherical coordinates; a phase."},
    "ϑ":{n:"theta (variant)",d:"A stylistic variant glyph of θ."},
    "ι":{n:"iota",d:"Rarely used; occasionally a tiny quantity."},
    "κ":{n:"kappa",d:"Curvature; thermal conductivity; the dielectric constant."},
    "λ":{n:"lambda",d:"Wavelength; an eigenvalue; a decay constant; the cosmological constant."},
    "μ":{n:"mu",d:"Reduced mass; magnetic moment; permeability; the prefix micro (10⁻⁶); friction."},
    "ν":{n:"nu",d:"Frequency; a neutrino; kinematic viscosity."},
    "ξ":{n:"xi",d:"Correlation/coherence length; a generalized coordinate; a random variable."},
    "ο":{n:"omicron",d:"Almost never used — visually identical to a Latin o."},
    "π":{n:"pi",d:"The ratio 3.14159…; also a pion (π meson)."},
    "ϖ":{n:"pi (variant)",d:"A stylistic variant glyph of π."},
    "ρ":{n:"rho",d:"Mass or charge density; resistivity; the density matrix; a correlation."},
    "σ":{n:"sigma",d:"Stress; conductivity; a cross-section; standard deviation; the Pauli matrices."},
    "ς":{n:"sigma (final)",d:"Word-final form of σ; not a distinct physics symbol."},
    "τ":{n:"tau",d:"Torque; a time constant; proper time; the tau lepton."},
    "υ":{n:"upsilon",d:"Rare; appears in the name of the Upsilon meson."},
    "φ":{n:"phi",d:"An azimuthal angle; electric potential; a phase; magnetic flux."},
    "ϕ":{n:"phi (variant)",d:"A stylistic variant glyph of φ."},
    "χ":{n:"chi",d:"Electric or magnetic susceptibility; the chi-squared statistic."},
    "ψ":{n:"psi",d:"The quantum-mechanical wavefunction."},
    "ω":{n:"omega",d:"Angular frequency 2πf; angular velocity; an element of solid angle."},
    /* Greek uppercase */
    "Γ":{n:"Gamma",d:"The gamma function; the Christoffel symbols; a reflection coefficient."},
    "Δ":{n:"Delta",d:"A finite change or difference; a discriminant; the Laplacian."},
    "Θ":{n:"Theta",d:"Temperature; the Heaviside step function Θ(x)."},
    "Λ":{n:"Lambda",d:"The cosmological constant; a Lambda baryon; a cutoff scale."},
    "Ξ":{n:"Xi",d:"The grand partition function; a Xi (cascade) baryon."},
    "Π":{n:"Pi",d:"A product of terms; osmotic pressure; a projection operator."},
    "Σ":{n:"Sigma",d:"A sum of terms; self-energy; a Sigma baryon."},
    "Υ":{n:"Upsilon",d:"The Upsilon meson — a bound state of a b and anti-b quark."},
    "Φ":{n:"Phi",d:"Magnetic or electric flux; the work function of a metal."},
    "Χ":{n:"Chi",d:"Capital chi; rarely distinguished from a Latin X."},
    "Ψ":{n:"Psi",d:"A total or many-body wavefunction."},
    "Ω":{n:"Omega",d:"The ohm (unit of resistance); a solid angle; the count of microstates."},
    /* operators */
    "∂":{n:"partial derivative",d:"Rate of change with the other variables held fixed."},
    "∇":{n:"nabla / del",d:"The vector derivative: gradient, and with · or × the divergence or curl."},
    "∇²":{n:"Laplacian",d:"Divergence of the gradient; appears in wave, heat and Poisson equations."},
    "∆":{n:"increment",d:"A finite change; also written for the Laplacian operator."},
    "∫":{n:"integral",d:"A continuous sum — the area under a curve."},
    "∬":{n:"double integral",d:"Integration over a 2-D region."},
    "∭":{n:"triple integral",d:"Integration over a 3-D volume."},
    "∮":{n:"contour integral",d:"An integral around a closed loop."},
    "∯":{n:"surface integral",d:"An integral over a closed surface."},
    "∑":{n:"summation",d:"The sum of a sequence of terms."},
    "∏":{n:"product",d:"The product of a sequence of terms."},
    "√":{n:"square root",d:"The number whose square gives the radicand."},
    "∛":{n:"cube root",d:"The number whose cube gives the radicand."},
    "ⅆ":{n:"differential",d:"The d in dx — an infinitesimal element."},
    "lim":{n:"limit",d:"The value a function approaches."},
    "↦":{n:"maps to",d:"Defines a function: input ↦ output."},
    /* arithmetic & vectors */
    "+":{n:"plus",d:"Addition."},
    "−":{n:"minus",d:"The true minus sign — longer than a hyphen."},
    "±":{n:"plus-or-minus",d:"Two values at once, e.g. error bars or both quadratic roots."},
    "∓":{n:"minus-or-plus",d:"Pairs with ± to denote the opposite sign."},
    "×":{n:"cross / times",d:"Multiplication, or the vector cross product."},
    "÷":{n:"division",d:"Divide one quantity by another."},
    "⋅":{n:"dot product",d:"The scalar product of two vectors; also plain multiplication."},
    "∗":{n:"asterisk",d:"Convolution, or a complex-conjugate marker."},
    "∘":{n:"composition",d:"Function composition f∘g, or an element-wise product."},
    "⊗":{n:"tensor product",d:"The outer product; combines state spaces in quantum mechanics."},
    "⊕":{n:"direct sum",d:"Combines vector spaces or modules."},
    "⊙":{n:"Hadamard product",d:"The element-wise product of two arrays."},
    "∥":{n:"parallel",d:"Two lines or vectors that never meet."},
    "⊥":{n:"perpendicular",d:"Orthogonal; also denotes the orthogonal complement."},
    "∠":{n:"angle",d:"The angle between two rays."},
    "°":{n:"degree",d:"An angular degree; 360° make a full turn."},
    /* relations & logic */
    "=":{n:"equals",d:"The two sides are equal."},
    "≈":{n:"approximately equal",d:"Equal to a good approximation."},
    "≃":{n:"asymptotically equal",d:"Equal in a limiting regime."},
    "≅":{n:"congruent",d:"Geometrically congruent, or isomorphic."},
    "≡":{n:"identically equal",d:"Equal by definition, or true for all values."},
    "≠":{n:"not equal",d:"The two sides differ."},
    "≤":{n:"less than or equal",d:"At most as large as."},
    "≥":{n:"greater than or equal",d:"At least as large as."},
    "≪":{n:"much less than",d:"Smaller by orders of magnitude."},
    "≫":{n:"much greater than",d:"Larger by orders of magnitude."},
    "∝":{n:"proportional to",d:"Related by a constant factor."},
    "∼":{n:"of order / distributed as",d:"Same order of magnitude, or 'is distributed as'."},
    "→":{n:"approaches / yields",d:"Tends to a limit, or the product of a reaction."},
    "⇒":{n:"implies",d:"If the left holds, so does the right."},
    "⇔":{n:"if and only if",d:"Each side implies the other."},
    "∴":{n:"therefore",d:"Introduces a conclusion."},
    "∵":{n:"because",d:"Introduces a reason."},
    /* sets */
    "∈":{n:"element of",d:"Belongs to a set."},
    "∉":{n:"not an element of",d:"Does not belong to a set."},
    "∋":{n:"contains element",d:"The set contains this element."},
    "⊂":{n:"proper subset",d:"Contained in, and strictly smaller than."},
    "⊆":{n:"subset",d:"Contained in, possibly equal."},
    "⊃":{n:"proper superset",d:"Contains, and strictly larger than."},
    "⊇":{n:"superset",d:"Contains, possibly equal."},
    "∪":{n:"union",d:"All elements in either set."},
    "∩":{n:"intersection",d:"Elements common to both sets."},
    "∖":{n:"set difference",d:"Elements of one set not in the other."},
    "∅":{n:"empty set",d:"The set with no elements."},
    "∀":{n:"for all",d:"The statement holds for every element."},
    "∃":{n:"there exists",d:"At least one element satisfies the statement."},
    "∄":{n:"there does not exist",d:"No element satisfies the statement."},
    "∞":{n:"infinity",d:"Unbounded — larger than any finite quantity."},
    "ℝ":{n:"real numbers",d:"The set of all real numbers."},
    "ℂ":{n:"complex numbers",d:"Numbers of the form a + bi."},
    "ℤ":{n:"integers",d:"The whole numbers, positive and negative."},
    "ℕ":{n:"natural numbers",d:"The counting numbers."},
    "ℚ":{n:"rational numbers",d:"Numbers expressible as a ratio of integers."},
    /* quantum & bra-ket */
    "ℏ":{n:"reduced Planck constant",d:"h/2π ≈ 1.055×10⁻³⁴ J·s — the quantum of action."},
    "ℎ":{n:"Planck constant",d:"h ≈ 6.626×10⁻³⁴ J·s — links a photon's energy to its frequency."},
    "⟨":{n:"bra",d:"Left half of Dirac notation — a dual (row) vector."},
    "⟩":{n:"ket",d:"Right half of Dirac notation — a state (column) vector."},
    "|":{n:"bar",d:"Separates parts of a bra-ket, or means 'given / such that'."},
    "⟨ψ|":{n:"bra ψ",d:"A dual state vector."},
    "|ψ⟩":{n:"ket ψ",d:"A quantum state vector."},
    "⟨φ|ψ⟩":{n:"inner product",d:"The overlap amplitude between two quantum states."},
    "Ĥ":{n:"Hamiltonian",d:"The total-energy operator; it generates time evolution."},
    "|0⟩":{n:"ground state",d:"A qubit's 0 / lower-energy basis state."},
    "|1⟩":{n:"excited state",d:"A qubit's 1 / higher-energy basis state."},
    "↑":{n:"spin up",d:"Spin aligned with the chosen axis."},
    "↓":{n:"spin down",d:"Spin anti-aligned with the chosen axis."},
    /* accents */
    "⃗":{n:"vector arrow",d:"Marks a quantity as a vector, e.g. v⃗. Attaches to the letter before the cursor."},
    "̂":{n:"hat",d:"A unit vector (x̂) or a quantum operator (Ĥ). Attaches to the previous letter."},
    "̇":{n:"dot",d:"A time derivative, ẋ = dx/dt. Attaches to the previous letter."},
    "̈":{n:"double dot",d:"A second time derivative, ẍ. Attaches to the previous letter."},
    "̄":{n:"bar",d:"An average value, or a complex conjugate. Attaches to the previous letter."},
    "̃":{n:"tilde",d:"A Fourier transform, or a perturbed quantity. Attaches to the previous letter."},
    "̅":{n:"overline",d:"An average or a complex conjugate. Attaches to the previous letter."},
    "′":{n:"prime",d:"A derivative, or a transformed / alternate variable."},
    "″":{n:"double prime",d:"A second derivative."},
    /* superscripts / subscripts */
    "⁺":{n:"superscript plus",d:"Positive charge, or a raised + sign."},
    "⁻":{n:"superscript minus",d:"Negative charge, or an inverse such as x⁻¹."},
    "ⁿ":{n:"superscript n",d:"A general exponent."},
    "ⁱ":{n:"superscript i",d:"A raised i — e.g. in eⁱˣ."},
    "⁽":{n:"superscript (",d:"Opening parenthesis, raised."},
    "⁾":{n:"superscript )",d:"Closing parenthesis, raised."},
    "†":{n:"dagger",d:"The Hermitian conjugate (adjoint) of an operator."},
    "₊":{n:"subscript plus",d:"A lowered + sign."},
    "₋":{n:"subscript minus",d:"A lowered − sign."},
    "ₙ":{n:"subscript n",d:"A general index."},
    "ᵢ":{n:"subscript i",d:"A tensor or summation index."},
    "ⱼ":{n:"subscript j",d:"A tensor or summation index."},
    "ₖ":{n:"subscript k",d:"A tensor or summation index."},
    "₍":{n:"subscript (",d:"Opening parenthesis, lowered."},
    "₎":{n:"subscript )",d:"Closing parenthesis, lowered."}
  }
  /* fill in the ten super/subscript digits */
  const sup = "⁰¹²³⁴⁵⁶⁷⁸⁹", sub = "₀₁₂₃₄₅₆₇₈₉"
  for (let i = 0; i < 10; i++) {
    desc[sup[i]] = {n:"superscript " + i, d:"A raised " + i + " — used as an exponent or power."}
    desc[sub[i]] = {n:"subscript " + i, d:"A lowered " + i + " — used as an index or label."}
  }

  /* ===== category layout data ===== */
  const panels = [
    {title:"Greek — lowercase",
     keys:"α β γ δ ε ζ η θ ϑ ι κ λ μ ν ξ ο π ϖ ρ σ ς τ υ φ ϕ χ ψ ω".split(" ")},
    {title:"Greek — uppercase",
     keys:"Γ Δ Θ Λ Ξ Π Σ Υ Φ Χ Ψ Ω".split(" ")},
    {title:"Calculus & operators",
     keys:"∂ ∇ ∇² ∆ ∫ ∬ ∭ ∮ ∯ ∑ ∏ √ ∛ ⅆ lim ↦".split(" ")},
    {title:"Arithmetic & vectors",
     keys:"+ − ± ∓ × ÷ ⋅ ∗ ∘ ⊗ ⊕ ⊙ ∥ ⊥ ∠ °".split(" ")},
    {title:"Relations & logic",
     keys:"= ≈ ≃ ≅ ≡ ≠ ≤ ≥ ≪ ≫ ∝ ∼ → ⇒ ⇔ ∴ ∵".split(" ")},
    {title:"Sets & number lines",
     keys:"∈ ∉ ∋ ⊂ ⊆ ⊃ ⊇ ∪ ∩ ∖ ∅ ∀ ∃ ∄ ∞ ℝ ℂ ℤ ℕ ℚ".split(" ")},
    {title:"Quantum & bra-ket",
     keys:"ℏ ℎ ⟨ ⟩ | ⟨ψ| |ψ⟩ ⟨φ|ψ⟩ Ĥ |0⟩ |1⟩ ↑ ↓ ⊗".split(" ")},
    {title:"Accents — attach to last letter", accent:true, keys:[
      {sym:"⃗",show:"x⃗"},{sym:"̂",show:"x̂"},{sym:"̇",show:"ẋ"},{sym:"̈",show:"ẍ"},
      {sym:"̄",show:"x̄"},{sym:"̃",show:"x̃"},{sym:"̅",show:"x̅"},
      {sym:"′",show:"′"},{sym:"″",show:"″"}]},
    {title:"Superscripts",
     keys:"⁰ ¹ ² ³ ⁴ ⁵ ⁶ ⁷ ⁸ ⁹ ⁺ ⁻ ⁿ ⁱ ⁽ ⁾ †".split(" ")},
    {title:"Subscripts",
     keys:"₀ ₁ ₂ ₃ ₄ ₅ ₆ ₇ ₈ ₉ ₊ ₋ ₙ ᵢ ⱼ ₖ ₍ ₎".split(" ")},
    {title:"Snippets — full equations", snippet:true, keys:[
      {name:"Schrödinger",       sym:"iℏ ∂ψ/∂t = Ĥψ",
       idea:"How a quantum state changes in time — the master equation of quantum mechanics."},
      {name:"time-independent",  sym:"Ĥψ = Eψ",
       idea:"The allowed energy levels of a system, as the eigenvalues of its Hamiltonian."},
      {name:"mass–energy",       sym:"E = mc²",
       idea:"Mass is concentrated energy; even a little mass holds an enormous amount."},
      {name:"Planck",            sym:"E = ℏω",
       idea:"A photon's energy depends only on its frequency — energy comes in discrete quanta."},
      {name:"de Broglie",        sym:"λ = h/p",
       idea:"Every particle is also a wave; heavier or faster means a shorter wavelength."},
      {name:"uncertainty",       sym:"Δx Δp ≥ ℏ/2",
       idea:"Position and momentum can't both be sharp — pinning one blurs the other."},
      {name:"commutator",        sym:"[x̂, p̂] = iℏ",
       idea:"Position and momentum don't commute; this is the algebraic seed of quantum uncertainty."},
      {name:"Boltzmann",         sym:"S = k_B ln Ω",
       idea:"Entropy is a count of the microscopic states behind one macroscopic state."},
      {name:"Gauss law",         sym:"∇·E = ρ/ε₀",
       idea:"Electric charge is the source of the electric field — lines start and end on charge."},
      {name:"Faraday",           sym:"∇×E = −∂B/∂t",
       idea:"A changing magnetic field drives a circulating electric field — the basis of the generator."},
      {name:"Gaussian integral", sym:"∫ e^(−x²) dx = √π",
       idea:"The total area under the bell curve — a workhorse of statistics and field theory."},
      {name:"Dirac",             sym:"(iℏγ^μ ∂_μ − mc)ψ = 0",
       idea:"The relativistic equation for the electron — it forced the prediction of antimatter."},
      {name:"Einstein field",    sym:"G_μν = (8πG/c⁴) T_μν",
       idea:"Matter and energy curve spacetime; that curvature is what we feel as gravity."},
      {name:"Euler identity",    sym:"e^(iπ) + 1 = 0",
       idea:"Joins e, i, π, 1 and 0 — exponential growth and rotation are the same operation."}]}
  ]

  /* ===== keyboard layout data — staggered, ANSI-shaped ===== */
  const pk = ch => ({phys:ch, sym:physicalMap[ch]})                 // a physics key
  const sk = (label,kind,info) => ({special:true,label,kind,info})  // a special key
  const kbRows = [
    ["`","1","2","3","4","5","6","7","8","9","0","-","="].map(pk)
      .concat([sk("⌫","backspace",{n:"Backspace",d:"Delete the character before the cursor."})]),
    [sk("Tab","tab",{n:"Tab",d:"Insert spacing."})]
      .concat(["q","w","e","r","t","y","u","i","o","p","[","]"].map(pk)),
    [sk("⇪ Greek","mode",{n:"Greek mode",d:"Toggle — makes the physical keyboard type physics symbols."})]
      .concat(["a","s","d","f","g","h","j","k","l",";","'"].map(pk))
      .concat([sk("↵","enter",{n:"Enter",d:"Insert a line break."})]),
    [sk("⇧","shift",{n:"Shift",d:"Hold with a letter for the uppercase Greek form."})]
      .concat(["z","x","c","v","b","n","m",",",".","/"].map(pk))
      .concat([sk("⇧","shift",{n:"Shift",d:"Hold with a letter for the uppercase Greek form."})]),
    [sk("Alt","alt",{n:"Alt",d:"Hold Alt + a letter for one-off Greek without switching modes."}),
     sk("space","space",{n:"Space",d:"Insert a space."}),
     sk("Alt","alt",{n:"Alt",d:"Hold Alt + a letter for one-off Greek without switching modes."})]
  ]
  /* widths for the special keys, in px */
  const spWidth = {backspace:92, tab:80, mode:104, enter:104, shift:122, alt:74, space:360}

  /* ===== search index — mnemonic / LaTeX-style recall ===== */
  const combiningMarks = new Set(["⃗","̂","̇","̈","̄","̃","̅"])
  const aliases = {
    "ℏ":"hbar planck reduced", "ℎ":"planck constant",
    "∇":"nabla del grad gradient divergence curl", "∇²":"laplacian del squared",
    "∂":"partial", "∆":"laplacian increment",
    "∑":"sum", "∏":"prod product", "∫":"int", "∬":"iint", "∭":"iiint",
    "∮":"oint contour loop", "∯":"surface", "√":"sqrt root radical", "∛":"cbrt root",
    "∞":"infty infinite", "±":"pm plusminus", "∓":"mp", "×":"times cross",
    "⋅":"cdot dot", "÷":"div", "⊗":"otimes tensor", "⊕":"oplus", "⊙":"odot",
    "≈":"approx", "≃":"simeq", "≅":"cong", "≡":"equiv identical", "≠":"neq",
    "≤":"leq le", "≥":"geq ge", "≪":"ll", "≫":"gg", "∝":"propto", "∼":"sim",
    "∈":"in", "∉":"notin", "∋":"ni", "⊂":"subset", "⊆":"subseteq",
    "⊃":"supset", "⊇":"supseteq", "∪":"cup union", "∩":"cap intersection",
    "∖":"setminus", "∅":"emptyset varnothing", "∀":"forall", "∃":"exists",
    "∄":"nexists", "→":"to rightarrow", "⇒":"implies", "⇔":"iff",
    "∴":"therefore", "∵":"because", "°":"deg degree", "†":"dagger dag adjoint",
    "⟨":"langle bra", "⟩":"rangle ket", "ℝ":"reals", "ℂ":"complex",
    "ℤ":"integers", "ℕ":"naturals", "ℚ":"rationals", "Ĥ":"hamiltonian",
    "∘":"circ compose", "∥":"parallel", "⊥":"perp bot", "∠":"angle",
    "↦":"mapsto", "↑":"uparrow up", "↓":"downarrow down",
    "⃗":"vec vector arrow", "̂":"hat", "̇":"dot", "̈":"ddot", "̄":"bar",
    "̃":"tilde", "̅":"overline"
  }
  const equationItems = panels.find(p => p.snippet).keys
  const searchIndex = []
  for (const sym in desc) {
    const comb = combiningMarks.has(sym)
    searchIndex.push({
      sym, kind:"symbol",
      show: comb ? "x" + sym : sym,
      name: desc[sym].n, info: desc[sym],
      text: (desc[sym].n + " " + desc[sym].d + " " + (aliases[sym] || "")).toLowerCase()
    })
  }
  for (const eq of equationItems) {
    searchIndex.push({
      sym: eq.sym, kind:"equation", show: eq.sym, snippetName: eq.name,
      name: eq.name, info: {n:eq.name, d:eq.idea},
      text: (eq.name + " " + eq.idea + " " +
             (/Schr/.test(eq.name) ? "schrodinger" : "")).toLowerCase()
    })
  }
  const commonEntries =
    "ℏ ∂ ∇ ∫ ∑ √ π ∞ α β γ δ ε θ λ μ ν ρ σ φ ψ ω Δ Ω ± ≈ ≠ ≤ ≥ ⟨ ⟩ † ∈ ∀"
      .split(" ")
      .map(s => searchIndex.find(e => e.sym === s))
      .filter(Boolean)

  /* reverse map (Greek symbol → physical key) for the keyboard corner hint */
  const symToPhys = {}
  for (const k in physicalMap) {
    if (k >= "a" && k <= "z") symToPhys[physicalMap[k]] = k
  }

  /* ===== search ranking (mnemonic recall) ===== */
  function rankEntry(en, q) {
    const n = en.name.toLowerCase()
    if (n === q) return 0
    if (n.startsWith(q)) return 1
    if (n.split(/[^a-z0-9]+/).includes(q)) return 2
    if (n.includes(q)) return 3
    return 4
  }
  function matchSearch(q) {
    return searchIndex
      .filter(en => en.text.includes(q))
      .sort((a, b) => rankEntry(a, q) - rankEntry(b, q))
  }

  window.HBARPhysics = {
    physicalMap, greekUpper, desc, panels, kbRows, spWidth,
    combiningMarks, aliases, searchIndex, commonEntries, symToPhys, matchSearch
  }
})()
