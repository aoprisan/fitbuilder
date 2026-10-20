/**
 * Bundled typefaces — self-hosted from the @fontsource packages so the app makes
 * no third-party font requests (it used to load them from Google Fonts) and
 * renders in its real faces offline, including the very first launch of the
 * native app. Vite emits the woff2/woff files next to the bundle.
 *
 * Per-weight files (not single-subset ones) on purpose: they declare every
 * subset with its `unicode-range`, so a page only downloads the subsets its text
 * uses — latin + latin-ext covers English and Romanian (ă â î ș ț).
 *
 * Default theme: Alfa Slab One (display), Bungee (stamp), IBM Plex Mono (body).
 * The alternate themes add Oswald / Saira Stencil One / Anton (see styles.css).
 * The Sport themes (the default) use Inter for text and Barlow Condensed for
 * display; `sportFonts.css` pins their bold cuts as weight-free aliases.
 */
import "@fontsource/alfa-slab-one/400.css";
import "@fontsource/bungee/400.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "@fontsource/ibm-plex-mono/700.css";
import "@fontsource/oswald/500.css";
import "@fontsource/oswald/600.css";
import "@fontsource/oswald/700.css";
import "@fontsource/saira-stencil-one/400.css";
import "@fontsource/anton/400.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "./sportFonts.css";
