import {
  columnFilteringFeature,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures,
} from "@tanstack/react-table";

/**
 * Funktionen jeder Backoffice-Tabelle. Sortieren, Filtern und Blättern macht die API
 * (`manualSorting`, `manualFiltering`, `manualPagination`), die Tabelle hält nur den Zustand.
 */
export const dataTableFeatures = tableFeatures({
  rowSortingFeature,
  columnFilteringFeature,
  globalFilteringFeature,
  rowPaginationFeature,
});
export type DataTableFeatures = typeof dataTableFeatures;
