# Viento en contexto

Prototipo académico de **optimización de parques eólicos mediante cálculo vectorial**. Conserva HTML, CSS, JavaScript y Canvas 2D; no necesita instalación, compilación, framework ni backend.

## Abrir

Abre `index.html` en un navegador moderno. Los scripts clásicos funcionan también con `file://`.

Opcionalmente, desde esta carpeta:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Abre `http://127.0.0.1:8000`. Si ya tenías la página abierta, recárgala con Ctrl+Shift+R. Sin conexión, los cálculos, imágenes y simulaciones funcionan; Google Fonts se sustituye por las fuentes del sistema. Los enlaces bibliográficos requieren conexión.

## Demostración en cuatro etapas

El botón **Modo exposición** organiza cuatro etapas de 2:30 minutos. Anterior/Siguiente cambian de etapa; Salir o Escape recuperan la página completa. No hay avance automático ni cronómetro: los tiempos son una guía para el ensayo.

1. **Contexto:** explicar La Guajira, el problema de orientación y estelas y los objetivos. La referencia regional es IDEAM; las condiciones del simulador son hipotéticas.
2. **Vectores:** usar el ejemplo predeterminado A=(8,3), B=(4,10). Mostrar magnitudes 8,54 y 10,77; cambio B−A=(−4,7); producto punto 62; componente Z del cruz 68; ángulo 47,64°. Mostrar A y pulsar Transición → B. Comparar los modos cartesiano y polar.
3. **Parque:** pulsar **Cargar demo de estelas**. Se restablecen seis turbinas, filas alineadas, viento (10,0), frentes a 180° e intervalo de una hora. Las turbinas aguas abajo pierden potencia. Pulsar **Buscar mejor configuración**; comparar el parque y la lectura antes/después. Los controles del parque permiten cambiar el viento sin abandonar la escena.
4. **Resultados:** interpretar potencia en MW y energía en MWh, pérdidas separadas y comparación. Explicar que se selecciona la mejor alternativa evaluada, no el óptimo global. Cerrar con los límites del modelo.

Con la demo anterior y los parámetros actuales se evalúan 19 candidatos válidos: aproximadamente **4,84 → 7,14 MW**, mejora **47,60%**. Son resultados calculados del escenario educativo, no mediciones de un parque real. Otra dirección o distribución puede producir otra mejora o ninguna.

## Interacción y convenciones

- Editar una condición válida la aplica inmediatamente al viento actual. Ambos modos de entrada comparten el mismo vector; los controles del parque editan A o B, según la selección.
- **0° derecha/este, 90° arriba/norte, 180° izquierda/oeste, −90° abajo/sur.** Se muestra la dirección hacia la que se desplaza el aire, no la procedencia meteorológica.
- El frente de la turbina apunta hacia la procedencia: para flujo a 0°, la orientación frontal alineada es ±180°. El botón de orientación ajusta los seis frentes.
- La transición polar empieza en el viento actual, sigue el camino angular corto y puede sustituirse o interrumpirse. No es una suma vectorial física.
- Los vacíos y valores fuera de rango no reemplazan el estado válido. La magnitud máxima admitida es 30 m/s, también en modo cartesiano.
- Un vector nulo no tiene dirección ni ángulo con otro vector. No se dibuja una flecha actual de longitud positiva y las partículas se detienen. Las referencias no nulas A/B pueden seguir visibles, identificadas por su etiqueta.
- Posiciones y orientaciones se editan en el inspector de turbina. Se respetan el margen del terreno y la separación mínima; los cambios inválidos no se aplican.
- Una comparación queda invalidada al cambiar sus condiciones. La búsqueda fija una instantánea del viento y el intervalo; todos los candidatos usan esos mismos datos.
- Pausar movimiento detiene partículas, palas y la transición. Los cálculos siguen respondiendo a las entradas. El movimiento reducido conserva los dibujos estáticos actualizados.

## Modelo educativo

Los parámetros están en `WindModel.PARAMS` (`model.js`):

| Parámetro | Valor |
|---|---|
| Densidad del aire | 1,225 kg/m³ |
| Diámetro del rotor | 80 m |
| Coeficiente de potencia Cₚ | 0,42 |
| Rendimiento del sistema η | 0,92 |
| Potencia nominal | 2 MW por máquina |
| Rango operativo | 3 ≤ V < 25 m/s |
| Coeficiente de empuje Cₜ | 0,8 para emisores activos |
| Expansión de estela k | 0,05 |
| Terreno | 1600 × 1600 m |
| Margen de centros / separación mínima | 80 m / 240 m |

**Potencia:** Pᵥ=½ρAV³, A=πD²/4. P₀=min(Pnom, PᵥCₚη) dentro del rango operativo, cero fuera. Se multiplica por max(0,cos γ)³, una ley didáctica de desalineación, no una curva calibrada de fabricante. El corte por viento ambiente detiene todas las máquinas. El déficit local puede llevar una turbina por debajo del arranque.

**Estela:** adaptación de Jensen con radio D/2+ks y déficit δ=(1−√(1−Cₜ))/(1+2ks/D)². Las distancias longitudinal y transversal se obtienen proyectando la separación entre turbinas sobre la dirección del viento y su perpendicular. Se procesan emisores aguas arriba; cada déficit se escala por su velocidad local respecto al viento ambiente. Se combinan por raíz de suma de cuadrados, limitada a 1. La misma función de velocidad local alimenta las turbinas y las partículas.

Se evalúa el centro del rotor, sin solapamiento parcial de discos. No se modelan deflexión de estela por yaw, turbulencia, relieve, densidad variable ni control aerodinámico. Cₜ es constante y las máquinas que no producen no emiten estela en esta simplificación. Los símbolos de turbinas se amplían para facilitar su lectura.

**Pérdidas:** ideal alineado y sin estelas → aplicar desalineación → aplicar estelas. Las diferencias entre esas tres potencias son pérdidas por yaw y pérdidas adicionales por estela; su suma coincide con ideal menos potencia final. La referencia de potencia del viento suma áreas de rotores aislados, no energía extraíble repetida dentro de estelas.

**Energía:** E[MWh]=P[MW]×t[h], con viento constante durante el intervalo. Es un escenario estacionario; no se integra el tiempo de la animación ni se estima producción anual.

**Búsqueda:** configuración actual más diseños y rotaciones discretas (0°,30°,60°,90°), con frentes alineados. Se descartan alternativas que incumplen límites y separación. La función objetivo es maximizar la suma de potencias eléctricas bajo el mismo viento. No se afirma optimalidad global.

**Dibujo:** Xcanvas=origenX+sX; Ycanvas=origenY−sY. La misma escala se aplica a ambos ejes. Las partículas avanzan con deltaTime y velocidad local; el tiempo visual del flujo se acelera ×20 y no interviene en el cálculo de energía. No se simulan RPM reales ni ráfagas meteorológicas. El bucle se pausa cuando las vistas no son visibles o la pestaña está oculta.

## Archivos

- `index.html`: contenido académico, controles, tablas y recorrido de exposición.
- `styles.css`: identidad original y composición responsive del laboratorio y parque.
- `model.js`: operaciones puras, proyecciones, potencia, estelas, restricciones y búsqueda.
- `renderer.js`: plano cartesiano, partículas, turbinas y estelas en Canvas.
- `script.js`: estado compartido, validación, eventos, sincronización y presentación.
- `asset/fondo_hero.jpge`: recurso original conservado, internamente WebP.
- `tests/model.test.cjs`: pruebas matemáticas y físicas simplificadas.
- `tests/regression.test.cjs`: integración con código real y sustitutos de DOM/Canvas.

## Verificación

Con Node.js moderno, sin instalar paquetes:

```sh
node tests/model.test.cjs
node tests/regression.test.cjs
```

La cobertura incluye direcciones cartesianas y polares, geometría enviada al Canvas, desplazamiento de partículas, vector nulo, velocidad proporcional, independencia a 30/60 FPS, movimiento reducido, interrupciones, cruce ±180°, validación, restricciones, pérdidas, búsqueda reproducible, energía, controles del parque y presentación.

Las pruebas en memoria no verifican píxeles, tipografía, navegación nativa ni rendimiento real. Firefox está presente en el entorno de desarrollo, pero sus intentos de ejecución headless terminan con código 139 antes de generar capturas. Queda pendiente la revisión visual en navegador y en el proyector de la exposición: escritorio, portátil, móvil, zoom, teclado y legibilidad. Los tamaños de Canvas sí se prueban en memoria.

## Fuentes

- [IDEAM — En Colombia, ¿dónde hace más viento?](https://ideam.gov.co/atencion-y-servicios-a-la-ciudadania/preguntas-frecuentes/en-colombia-donde-hace-mas-viento)
- [LoCascio et al. (2022), FLOWERS — formulación Jensen y optimización de parques](https://wes.copernicus.org/articles/7/1137/2022/wes-7-1137-2022.html)
- [Department of Energy — Small Wind Guidebook](https://www.energy.gov/cmei/systems/windexchange/small-wind-guidebook)

Las referencias respaldan los conceptos; los valores de turbina, terreno y escenarios son supuestos de este prototipo.
