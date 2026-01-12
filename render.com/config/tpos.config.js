// Load environment variables
require("dotenv").config();

module.exports = {
    API_BASE:
        process.env.TPOS_API_BASE ||
        "https://tomato.tpos.vn/odata/ProductTemplate",
    AUTH_TOKEN:
        process.env.TPOS_AUTH_TOKEN ||
        "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJDbGllbnRJZCI6InRtdFdlYkFwcCIsImh0dHA6Ly9zY2hlbWFzLnhtbHNvYXAub3JnL3dzLzIwMDUvMDUvaWRlbnRpdHkvY2xhaW1zL25hbWVpZGVudGlmaWVyIjoiYWU1YzcwYTEtODk4Yy00ZTlmLWIyNDgtYWNjMTBiNzAzNmJjIiwiaHR0cDovL3NjaGVtYXMueG1sc29hcC5vcmcvd3MvMjAwNS8wNS9pZGVudGl0eS9jbGFpbXMvbmFtZSI6Im52a3QiLCJEaXNwbGF5TmFtZSI6Im52a3QiLCJBdmF0YXJVcmwiOiIiLCJTZWN1cml0eVN0YW1wIjoiMTc3NTUyZTItNTMzYS00MmU1LWE2YWYtNTQ3MDdjY2JkYjk2IiwiQ29tcGFueUlkIjoiMSIsIlRlbmFudElkIjoidG9tYXRvLnRwb3Mudm4iLCJSb2xlSWRzIjoiNzYzOWEwNDgtN2NmZS00MGI1LWE0MWQtYWUzZjAwM2I4OWRmIiwiaHR0cDovL3NjaGVtYXMubWljcm9zb2Z0LmNvbS93cy8yMDA4LzA2L2lkZW50aXR5L2NsYWltcy9yb2xlIjoiQ1NLSCAtIEzDoGkiLCJqdGkiOiIwZGRjOTM1OC05MjcxLTQ1NWQtOWRmYS05ZTAxZjM1Mzc2ZTIiLCJpYXQiOiIxNzU5OTg0Mzk5IiwibmJmIjoxNzU5OTg0Mzk5LCJleHAiOjE3NjEyODAzOTksImlzcyI6Imh0dHBzOi8vdG9tYXRvLnRwb3Mudm4iLCJhdWQiOiJodHRwczovL3RvbWF0by50cG9zLnZuLGh0dHBzOi8vdHBvcy52biJ9.elBuyYZ-Emhxh7LrLcea-wZIkhBBlFuuo3cNi-ly6qo",
    CREATED_BY_NAME: process.env.TPOS_CREATED_BY_NAME || "nvkt",
    EXPAND_PARAMS:
        process.env.TPOS_EXPAND_PARAMS ||
        "UOM,UOMCateg,Categ,UOMPO,POSCateg,Taxes,SupplierTaxes,Product_Teams,Images,UOMView,Distributor,Importer,Producer,OriginCountry,ProductVariants($expand=UOM,Categ,UOMPO,POSCateg,AttributeValues),AttributeLines,UOMLines($expand=UOM),ComboProducts,ProductSupplierInfos",
};
