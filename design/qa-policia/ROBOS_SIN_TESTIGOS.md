# Robos sin testigos: alternativas de diseño

Estado: **propuesta, sin implementar.** La regla actual no cambia hasta que se elija una opción.

## La regla de hoy

Un carterista de la calle (`src/systems/Pickpocket.ts`) acierta con probabilidad `success = 0.6` y la víctima lo nota
con `victimNotices = 0.35` (`src/config/metro.ts`). Si falla, se nota siempre.

| Desenlace contra el jugador | Parte de los intentos | Qué ve el jugador | Denunciable |
|---|---|---|---|
| Falla (lo nota) | 40 % | «Notas una mano en el bolsillo…» | No (no hay pérdida) |
| Roba y lo nota | 21 % | «¡Eh! … Te faltan €X.» | Sí, en la comisaría |
| Roba sin notarlo | **39 %** | Nada: el dinero baja en el HUD y en el registro («Te han robado») | **No** |

El último caso no se registra en `Police` (`report` sólo se llama si alguien lo ve), así que la recepción no lo
ofrece. Es coherente («lo que no ve nadie no lo atiende nadie»), pero el jugador pierde dinero sin aviso y sin
ningún recurso, y el registro de movimientos dice «Te han robado» mientras la comisaría no sabe nada.

## Alternativas

**A. Dejarlo como está.** Sin código. Realista; puede leerse como un fallo («he perdido dinero y nadie me dice nada»).

**B. Descubrirlo después (recomendada).** El robo sin testigos se apunta como no notado. El jugador lo descubre en
el siguiente momento natural: al pagar algo, al abrir la bolsa o el móvil, o al cambiar de escena. Entonces sale
«Te falta €X: alguien te ha robado» y se puede denunciar. La denuncia queda registrada pero sin patrulla ni persecución,
porque ya es tarde. Toca `Pickpocket` (avisar a la escena también sin notarlo), `Police.recordIncident` (marca de
«descubierto tarde») y la escena (el momento del descubrimiento). Se guarda con la memoria de la comisaría que ya existe.

**C. Todo robo con pérdida es denunciable.** Cualquier «Te han robado» de las últimas 24 h aparece en la recepción.
Es lo más simple, pero contradice la regla de los testigos y la denuncia deja de tener relación con lo que pasó.

**D. Avisar sin denuncia.** Un aviso diferido («Te falta €X») pero sin denuncia posible. Arregla que el jugador no se
entere, no que no tenga recurso.

**E. Menos robos invisibles al jugador.** Subir `victimNotices` sólo cuando la víctima es el jugador (p. ej. 0.6). Es
un ajuste de una línea; reduce el caso, pero no lo elimina.

## Criterios para decidir

- La pérdida debe entenderse (CLAUDE.md: nada de funcionalidad falsa ni sucesos ilegibles).
- Una denuncia se presenta una vez y sobrevive a recargar. Ya garantizado: `Police.policeMemory` va en la partida.
- Sin castigos inevitables: la frecuencia (zonas, densidad, 12 min de descanso) no cambia en ninguna opción.
