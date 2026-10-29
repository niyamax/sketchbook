export function BookCover({ className = '' }: {className?: string}) {
  return <div className={`sketchbook-cover ${className}`} role="img" aria-label="Unprinted charcoal paper sketchbook cover">
    <img className="cover-stock-image" src={`${import.meta.env.BASE_URL}textures/charcoal-paper.png`} alt="" draggable={false} />
  </div>;
}
