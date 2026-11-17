/**
 * CAS-09 · El puesto propio en el Gran Rastro: se alquila en el Tablón del Casco Antiguo para el domingo siguiente y
 * se atiende en la plaza, en el ancla de ambientación 'casco.plaza.market.02' (sin vendedor en data/popups.ts).
 * Reglas en systems/PlayerStall.ts.
 */
export const PLAYER_STALL = {
  popUp: 'gran-rastro',
  location: 'casco-antiguo',
  anchor: 'casco.plaza.market.02',
  fee: 8,
  maxListings: 5,
  minPrice: 1,
  maxPrice: 60,
  kinds: ['gift'],
  /** Lo que vale para quien pasa un objeto sin tique que no se vende en ningún catálogo (systems/PlayerStall.refPrice). */
  defaultRef: 3,
  /** Por encima de refPrice × esto, lo miran y siguen: no hay oferta. */
  overpriceK: 1.5,
} as const;
