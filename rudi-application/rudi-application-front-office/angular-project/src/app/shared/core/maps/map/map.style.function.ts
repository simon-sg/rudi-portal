import {Fill, Icon, Stroke, Style} from 'ol/style';
import CircleStyle from 'ol/style/Circle';

const blue = [0, 70, 128, 0.4];
const red = [255, 0, 0, 0.4];
const width = 3;


// Style sur les POLYGONS
export const POLYGON_STYLE = new Style({
    fill: new Fill({
        color: blue
    }),
    stroke: new Stroke({
        width,
        color: blue
    })
});

// Style pour un POINT
export const POINT_STYLE = new Style({
    image: new Icon({
        anchor: [0.5, 15],
        anchorXUnits: 'fraction',
        anchorYUnits: 'pixels',
        src: 'assets/map/Pins.png',
    }),
});

// Style pour un LINE
export const LINE_STYLE = new Style({
    fill: new Fill({
        color: blue
    }),
    stroke: new Stroke({
        color: blue,
        width
    }),
});

// Style feature en hover : surface
export const HOVERED_SURFACE_STYLE = new Style({
    fill: new Fill({
        color: red
    })
});

// Style feature en hover : point
export const HOVERED_POINT_STYLE = new Style({
    image: new CircleStyle({
        radius: 20,
        fill: new Fill({
            color: red
        })
    })
});

// Style feature en hover : point
export const HOVERED_LINE_STYLE = new Style({
    stroke: new Stroke({
        color: red,
        width
    }),
});

// Style pin d'adresse
export const ADDRESS_STYLE = new Style({
    image: new Icon({
        anchor: [0.5, 1],
        anchorXUnits: 'fraction',
        anchorYUnits: 'fraction',
        src: 'assets/map/pin-adresse.png',
        scale: 0.07
    }),
});

/**
 * Conversion d'une couleur hexadécimale (#rrggbb) en rgba(r, g, b, alpha), sans dépendance.
 * @param hex la couleur hexadécimale
 * @param alpha l'opacité (0 à 1)
 */
function hexToRgba(hex: string, alpha: number): string {
    const normalized = hex.replace('#', '');
    const red = parseInt(normalized.substring(0, 2), 16);
    const green = parseInt(normalized.substring(2, 4), 16);
    const blue = parseInt(normalized.substring(4, 6), 16);
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

/**
 * Style d'une couche vectorielle (WFS/GeoJSON) paramétré par sa couleur de palette, à la place des
 * styles fixes POLYGON_STYLE/LINE_STYLE/POINT_STYLE pour distinguer les couches sur la carte.
 * @param color la couleur hexadécimale de la couche (voir LAYER_COLOR_PALETTE)
 */
export function createColoredVectorStyle(color: string): (feature) => Style {
    const translucentRgba = hexToRgba(color, 0.4);
    return function coloredVectorStyle(feature): Style {
        switch (feature.getGeometry().getType()) {
            case 'MultiPolygon':
            case 'Polygon':
                return new Style({
                    fill: new Fill({
                        color: translucentRgba
                    }),
                    stroke: new Stroke({
                        width,
                        color: translucentRgba
                    })
                });
            case 'MultiLineString':
            case 'LineString':
                return new Style({
                    stroke: new Stroke({
                        width,
                        color: translucentRgba
                    })
                });
            case 'Point':
            case 'MultiPoint':
                return new Style({
                    image: new CircleStyle({
                        radius: 7,
                        fill: new Fill({
                            color: hexToRgba(color, 0.85)
                        }),
                        stroke: new Stroke({
                            width: 1.5,
                            color: 'white'
                        })
                    })
                });
        }
        return null;
    };
}

/**
 * Récupération du style quand une feture est hovered
 * @param type le type de la feature (en OL)
 */
export function getHoveredStyle(type: string): Style[] {
    if (type === 'MultiPolygon' || type === 'Polygon') {
        return [HOVERED_SURFACE_STYLE];
    } else if (type === 'MultiPoint' || type === 'Point') {
        return [POINT_STYLE, HOVERED_POINT_STYLE];
    } else if (type === 'MultiLineString' || type === 'LineString') {
        return [HOVERED_LINE_STYLE];
    }

    return null;
}
