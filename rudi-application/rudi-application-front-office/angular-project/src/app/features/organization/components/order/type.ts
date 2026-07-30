export type Order =
    'name' |
    '-name' |
    'openingDate' |
    '-openingDate' |
    'datasetCount' |
    '-datasetCount' |
    'projectCount' |
    '-projectCount';

export interface OrderItem {
    libelle: string;
    order: Order;
}
