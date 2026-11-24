/**
 * Both logos are always in the page and CSS shows the right one for the theme. Swapping one image's
 * source instead would leave the wrong logo visible until the new file has loaded.
 */
export function Logo({ className }: { className?: string }) {
  const cls = className ? ` ${className}` : "";
  return (
    <>
      <img className={`logo logo-light${cls}`} src="/logo.svg" alt="AQUA PRO" />
      <img className={`logo logo-dark${cls}`} src="/logo-white.svg" alt="" aria-hidden="true" />
    </>
  );
}
