/**
 * Slow, low-opacity gradient blobs + grain behind the whole app.
 * Purely decorative and pointer-events-none.
 */
export function AmbientBackground() {
 return (
 <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
 <div className="ambient-grid" />
 <div
 className="ambient-blob -top-40 start-[-10%] size-[38rem]"
 style={{ background: "radial-gradient(circle, rgb(42 89 160 / 0.55), transparent 68%)" }}
 />
 <div
 className="ambient-blob top-[18%] end-[-14%] size-[34rem] [animation-delay:-7s]"
 style={{ background: "radial-gradient(circle, rgb(181 138 91 / 0.45), transparent 68%)" }}
 />
 <div
 className="ambient-blob bottom-[-18%] start-[18%] size-[32rem] [animation-delay:-13s]"
 style={{ background: "radial-gradient(circle, rgb(45 212 191 / 0.28), transparent 68%)" }}
 />
 <div
 className="ambient-blob top-[52%] start-[45%] size-[28rem] [animation-delay:-19s]"
 style={{ background: "radial-gradient(circle, rgb(139 92 246 / 0.22), transparent 68%)" }}
 />
 <div className="ambient-noise" />
 </div>
 );
}
