
> On November 20, 2026, a mathematician said he had proved the Riemann Hypothesis together with Claude.
> Within a day, a machine confirmed the proof; within three days, the mathematical world was in uproar.
> This article makes three things clear: what the Riemann Hypothesis actually asks, what this "proof" means,
> and why "the machine says it's correct" and "a human understands it" are two very different things.

*Reading time: about 15 minutes. Every number in this piece I recomputed on my own machine; the script is at the end.*

---

## 1. A Weekend Set Off by One Post

It started with a very short tweet.

On the morning of November 20, 2026, Scott Armstrong, a mathematical physicist at the Sorbonne in Paris, posted just a few words — "@\_\_alpoge\_\_ ftw" — alongside a screenshot of an unpublished paper. That four-page note came from Levent Alpöge, a mathematician at Anthropic, posted on his own personal website. The opening line read:

> "I believe that, together with Claude, I have found a proof of the Riemann Hypothesis."

How big is the Riemann Hypothesis? Mathematician Brian Conrey called it "a monumental moment in human history, and I think the biggest thing that's ever happened in mathematics." Posed in 1859, it has resisted the field for 167 years. It is the eighth problem on Hilbert's famous 1900 list, and one of the seven Millennium Prize Problems for which the Clay Mathematics Institute offers a million dollars — of which only the Poincaré conjecture had been solved before.

Yet the manner of this announcement was deeply unusual. No journal submission, no human-readable paper. What was dumped out instead was roughly **17 million lines** of Lean code (17.37 million lines, to be precise, compressed into 14 volumes). Lean is a "proof assistant": you write every step of your reasoning in its language, and the computer checks each line for logical gaps.

The news detonated the math and AI worlds at once. And what made this different from past "an AI solved some problem" headlines was what happened in the next 72 hours: the machine said "correct" almost immediately, while humans still couldn't say "why."

---

## 2. Meet the Protagonist: What Does the Riemann Hypothesis Actually Ask?

To follow the controversy, you first need to know what the Hypothesis says. I'll keep formulas to a minimum.

### Primes are the atoms of the number world

A prime is a number divisible only by 1 and itself: 2, 3, 5, 7, 11, 13... They are the "atoms" of the integers — every integer factors uniquely into primes. But their spacing on the number line looks lawless: sometimes they cluster (11 and 13 are a twin pair), sometimes they are far apart.

For over two thousand years, the question mathematicians most wanted answered was: **up to some number x, how many primes are there in total?** This count is written π(x). For small x you can just count: there are 25 primes below 100. For large x, you need a formula.

At age 15, Gauss guessed an astonishingly accurate approximation: the number of primes below x is roughly the "logarithmic integral" li(x). How good is it? I counted the true number of primes with a sieve on my own machine and compared it to li(x):

| x | true π(x) | Gauss's li(x) | difference |
|---|---|---|---|
| 1,000 | 168 | 176.6 | 8.6 |
| 10,000 | 1,229 | 1,245.1 | 16.1 |
| 100,000 | 9,592 | 9,628.8 | 36.8 |
| 1,000,000 | 78,498 | 78,626.5 | 128.5 |

Look at the last column: x grows a thousandfold, yet the error only climbs from 8.6 to 128.5. Gauss's curve is like a plane skimming the ground, hugging the true staircase of primes the whole way.

### The key question: how big can the error get?

Gauss's li(x) is a smooth curve; the true π(x) is a jagged staircase that steps up by one at every prime. The question is: **how large can the gap between the two ever become?**

The Riemann Hypothesis, put as plainly as possible, asserts that this gap is **held firmly in check**: its magnitude never exceeds a scale of about √x. In other words, although the primes look random, their randomness is "the most honest kind" — like coin flips, the deviation always stays within what statistics permits, and never suddenly runs wild.

Stanford's Steven Strogatz has called the Hypothesis the *Moby Dick* of mathematics — the deep-sea leviathan that has roamed for over a century and that no one can catch. It matters because hundreds of theorems in number theory, and a swathe of cryptographic algorithms, are all built on the premise "assume the Riemann Hypothesis holds." Once it is proven, those results flip overnight from "probably true" to "certainly true."

---

## 3. Stack Ten Thousand Waves, and the Primes Appear

There is a brilliant metaphor that captures the heart of the Riemann Hypothesis in one stroke: **stack ten thousand waves, and you can see the primes.** This is not literary license — it corresponds to a real, precise formula in mathematics that I verified by hand.

### The zeros are the "waves"

Riemann studied a function called ζ (zeta). This function takes the value zero at certain points, called its "zeros." Some — the "trivial zeros" at the negative even numbers — are dull. The deadly ones are the "non-trivial zeros."

Riemann discovered something profound: **every non-trivial zero corresponds to one wave.** Stack all of these waves together, and you can exactly reconstruct the distribution of the primes. One zero, one sine wave; its position sets that wave's "pitch" and growth. The more waves you stack, the closer the reconstructed curve hugs the true staircase. Put another way: the first wave sounds a note, the second a little higher; by the time you've stacked ten thousand, the once-smooth curve grows a flight of steps at 2, 3, 5, 7, 11 — and that is exactly this.

### I computed it myself

To confirm that this is no exaggeration, I ran an experiment on my own computer: take the first 50 true ζ zeros, use the explicit formula (the main term minus the wave contributed by each zero) to reconstruct the prime-counting function ψ(x), and compare to the sieve's true value. The results (a window of 301 integers near x = 10000):

| zeros used | mean error | max error |
|---|---|---|
| 0 (main term x only) | 23.6 | 47.8 |
| 10 zeros | 14.1 | 31.3 |
| 25 zeros | 12.3 | 28.4 |

As more waves are stacked, the smooth main term gradually grows the shape of the staircase and the mean error keeps falling (the max error falls more slowly because of "Gibbs ringing" at the jumps — an unavoidable artifact of approximating a sudden step with finitely many waves). I also verified something more beautiful: the height of ψ(x)'s jump at each prime exactly equals the logarithm of that prime — at 10007 (a prime), the step jumps by 9.2110, and log(10007) = 9.2110, to the last digit. **The location of each step is the prime itself.**

### The Hypothesis = all the waves are "equally loud"

Now we can translate the Hypothesis into this picture. Each wave's "loudness" (amplitude) is set by the position of its corresponding zero. If some zero strays off the special "critical line" (the vertical line where the real part equals 1/2), its wave grows louder and louder as you stack, eventually scrambling the staircase beyond recognition, and the error runs wild.

**The Riemann Hypothesis says: all non-trivial zeros sit obediently on this critical line, so all the waves are "equally loud" and none runs out of control.** If you turned the numbers that govern these waves — the zeros themselves — into a single bell chime, then hearing that bell would mean you had met the protagonist of the Hypothesis.

Humans have verified over **12 trillion** zeros by computer — every one on the line. But between "checked 12 trillion" and "proved all infinitely many are on the line" lies a chasm: a single counterexample would collapse the entire edifice. That is exactly the chasm Alpöge and Claude claim to have crossed.

---

## 4. Those 72 Hours: The Machine Says "Yes," Humans Still Say "Huh?"

Back to November 20. After the tweet, Lean experts around the world began an overnight race to independently verify the 17 million lines.

### Why "it compiles" is not enough

Lean's first step in verifying a proof is "it compiles" — confirming there's no obvious logical fallacy in the code. Andrew Sutherland, a number theorist at MIT, was the first to get it through, before noon. But compiling only shows "the steps are valid"; two trickier questions remain:

1. **Is the theorem written in the code really the Riemann Hypothesis itself?** Kevin Buzzard of Imperial College had, on November 12, listed the criteria: in principle, code could quietly redefine a symbol and fool the machine with "the Riemann Hypothesis equals the Riemann Hypothesis." To rule this out, you run a "comparator run" — the community writes a separate file that imports only the standard math library, Mathlib, restates the Hypothesis verbatim, and compares it line by line against what Alpöge proved.
2. **Did it exploit a bug in Lean itself?** Lean's kernel has historically had bugs that let you "prove 0 = 1." So you verify with multiple independently implemented checkers.

### The community's joint certification

On November 21, the Lean FRO and the Mathlib Initiative issued a joint statement with a clear conclusion:

> "We are fully confident that Alpöge's proof of the Riemann Hypothesis is correct, and we congratulate him on this achievement."

The statement listed four criteria and confirmed each: the statement is correct (taken from Mathlib's vetted definitions); the code compiles (dozens of people reproduced the same exported file); it proves the right proposition (two independent tools, a comparator and a second checker, agree); and the proof is valid (Lean's official kernel, an independent Rust kernel, and checkers carrying their own formal correctness proofs all accept it).

Sutherland's verification page records the terrifying scale: zero-error compilation of all **175,187 modules** in the library, an exported proof file of **61.5 billion bytes** (~61.5 GB); Lean's paranoid-mode kernel ran **72 hours and 20 minutes** single-threaded to check the whole thing. The last line carries the reassuring words: **"Your solution is okay!"**

Stanford's Yu Deng (a 2026 Fields Medalist) flagged the distinction behind this: this is "machine-verified," not "accepted by the mathematical community." But as Shing-Tung Yau (also a Fields Medalist), attending a symposium in Shenzhen marking the 200th anniversary of Riemann's birth, put it, the standard of machine step-by-step decomposition and line-by-line checking is "even higher than the experimental verification standard of many major discoveries in physics," so there's no need to over-doubt its credibility. In his words, **"mathematics has entered a new era."**

---

## 5. The "250,000 Pages" Joke, and a Real Embarrassment

The number that broke out of this story most is "250,000 pages." It comes from a footnote in Alpöge's four-page note: he said he had Claude write the proof as human-readable prose, and it "ran to more than 250,000 pages," a book he jokingly called the "GRH… book."

The number went viral. Some outlets ran headlines like "250,000 pages of slop." On November 23, Alpöge posted on X, under the heading "stupid things I did," to clarify:

> "The 250,000+ pages was a joke! I think big numbers are hilarious."

But he stressed that while the page count was a joke, **that long, ugly manuscript really exists** — he just felt posting it would be "an enormous, unreadable slop disaster," so he released only the Lean code. He also admitted his Lean code "is obviously full of garbage, but it compiles," and that "all criticism of this garbage is completely fair, and I accept it."

Joke aside, the number touches a real embarrassment: **a proof confirmed one-hundred-percent correct by a machine that, to this day, not one human has read in full.** Jon Keating of Oxford said: "I don't understand it, and I suspect nobody fully does. When I look at it, I'm in a complete state of awe and wonder."

Canadian mathematician Daniel Litt summed up the strange situation most precisely:

> "(1) This Lean formalization of a proof of the Riemann Hypothesis is overwhelmingly likely to be correct. (2) No human understands it yet."

---

## 6. The Controversy: A Machine Can Guarantee "No Error," but Not "The Right Road"

Just as everyone thought the dust had settled, a twist arrived on November 22. A scholar named J. L. Nielsen released a rebuttal paper titled, bluntly, "On the Invalidity of Alpöge's Proof of the Riemann Hypothesis," updating it 14 times in 31 hours.

Her target was a geometric predicate deep in the code called `anyGeometry` — written to return true no matter the input (identically true). By her count, this always-true definition appears across 24 files and is called 118 times. From this she argued that the vast codebase had verified only a tautological shell, closing a logical loop with "the Riemann Hypothesis equals the Riemann Hypothesis."

This controversy pinpoints the **fundamental limitation** of tools like Lean:

- A machine can guarantee **logical consistency** — from the definitions and axioms you write down, every step of reasoning is airtight.
- But a machine **cannot judge whether the definitions you wrote down are faithful to the mathematical meaning they claim.** This is the distinction between "name" and "substance," and the machine cannot police it.

Yet Nielsen's rebuttal has a key gap. The community's verification took a **different route**: since the top-level statement was already confirmed by two independent tools to be Mathlib's standard Riemann Hypothesis, and independent kernels accepted a complete proof term with no extra axioms, then even if some intermediate code is written as always-true, that only means that code "doesn't do what its name claims" — it is **not by itself enough to overturn the top-level conclusion.** Nielsen herself acknowledged she had actually read only about 70 files, facing a colossus of 175,187 modules.

As of now, the Riemann Hypothesis has been neither disproved (Clay's site still lists it as unsolved) nor has this rebuttal been settled by an authoritative third party. But it put a new question on the table: **as machines grow ever better at finding logical shortcuts in oceans of code, how do humans ensure the road taken is the honest one?**

---

## 7. Not an Isolated Case: Who Gets the Credit, and Who Gets the Million

Pull the camera back, and this didn't fall from the sky.

- In August this year, Anthropic announced that an unreleased Claude model pushed the classic lower bound on "the proportion of zeros lying on the critical line" from 41.6% to 67.2%, using 60 sub-agents and 31 million output tokens. At the time they said they "did not expect these techniques to prove the Riemann Hypothesis itself."
- On November 23, Anthropic and OpenAI in turn produced proofs of VP≠VNP (Valiant's 1979 conjecture) in complexity theory, each with a Lean formalization.

AI is treating the whole of mathematics as a training ground. Two old questions are being forced to the front.

**The credit question.** Since May this year, OpenAI has listed only the company name "OpenAI" on papers, with no human authors; Anthropic chose to list Claude as an author; only Google DeepMind still keeps the tradition. The *Leiden Declaration*, released in June and signed by thousands of mathematicians, gives the community's consensus: **credit and responsibility should still belong to humans**; AI may participate but cannot replace the collective human labor behind a result. The new preprint platform Hexagon even requires submitters to declare "how much of this paper was written by AI, and how much the contributor personally understands."

**Who gets the million.** Not so fast. Under Clay Institute rules, a solution to a Millennium Problem must be formally published in a qualified journal, survive **at least two years** of public scrutiny, and win general acceptance before it enters prize review. Clay's site still marks the Riemann Hypothesis "active," not "solved." Machine verification and a formal prize are a long way apart.

Worth noting: hours after Alpöge's release, Ravi Vakil, president of the American Mathematical Society, rushed to make public a roughly 940-page, **all-human, no-AI** manuscript of the Generalized Riemann Hypothesis by Stanford mathematician Alessandro Masullo, years in the making. About 8 hours after it went public, someone (aided by a different AI model) found a gap in it; it is still being revised. On one side, 17 million lines of AI-assisted, machine-verified code; on the other, a 940-page human manuscript that AI then poked a hole in — the contrast is itself a portrait of the era.

---

## 8. What Really Changed: Proof Now Outpaces Understanding

Strip away the noise, and the deepest significance of this is not the Riemann Hypothesis itself.

Terence Tao (a 2006 Fields Medalist) ranked several recent AI-heavy results by "how far they've been digested": the 3D Euler result already has a human-readable proof; the Navier–Stokes one is roughly understood but not finalized; and the Generalized Riemann Hypothesis one has only "a huge, Lean-only proof." He expects it will take time to digest — though this time "at least one human author is available to talk to." On November 24, his blog launched a **G.R.H. Polymath** crowdsourced project, aiming to extract a human-readable argument back out of this Lean proof.

The old research paradigm was: humans find a pattern → humans write a proof → other humans check it. Now a new situation has appeared: **AI produces, first, a proof that passes machine verification but far exceeds humans' near-term ability to read.** The mathematician's job is expanding from "finding proofs" to "understanding, compressing, and distilling the proofs AI produces."

One boundary must be stated clearly: mathematics has a special kind of luck — its objects are pure logic, which is exactly why a "machine can check it line by line" shortcut like Lean exists at all. Experimental science has no such luck; it still cannot do without real observation, data reliability, and reproducibility, and cannot simply copy mathematics' machine-verification model.

But even within mathematics, this is stunning enough. For the first time it lets us see, so clearly: **the speed at which a scientific proof is completed may be starting to outrun the speed at which humans understand and digest it.** When a machine can confirm in 72 hours a proof humans may not read for years, the word "understand" now weighs more than the word "correct."

167 years ago, in that 1859 paper, Riemann wrote that he had "set aside" the search for a rigorous proof, because for his immediate purpose it "seemed dispensable." 167 years later, a machine finished the thing he set aside, while all of humanity still works to understand what it did.

The mathematician's job will not disappear, but it is changing. James Maynard (a 2022 Fields Medalist) put it coolly: AI will not put mathematicians out of work, but the transformation will inevitably bring pain — and **the role of human understanding remains extremely important, and that understanding is exactly what mathematicians must supply.**

The bell has rung. We've heard that it is "correct." Over the next few years, it falls to humans to hear *why* it is correct.

---

## Appendix: How to Check the Numbers

Every number in this piece (the π(x)–li(x) difference, the reconstruction error from stacking zeros, the height of ψ(x)'s jump at primes, and the qualitative comparison of adjacent zero spacings against random-matrix theory) comes from a single Python script with no third-party dependencies, sitting in the same directory as this article; run `python3 test_riemann.py` to reproduce them. The zero data are the imaginary parts of the first 50 publicly known non-trivial ζ zeros.

**Main sources** (all November 2026): Alpöge's own four-page note (alpo.ge/remark.pdf); the Lean community joint statement (leanprover-community.github.io); Andrew Sutherland's verification page (math.mit.edu/~drew/grh); Terence Tao's blog (terrytao.wordpress.com); *Nature*, *Quanta Magazine*, *Scientific American*; and responses from Shing-Tung Yau, Yu Deng, and James Maynard in the press. This is a popular-science synthesis, not a peer-reviewed conclusion; final adjudication of the Riemann Hypothesis still requires the full process of the mathematical community.
