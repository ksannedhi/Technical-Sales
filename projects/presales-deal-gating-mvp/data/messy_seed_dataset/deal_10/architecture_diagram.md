```mermaid
graph LR
    EP[Endpoints] --> COL[Collectors]
    COL --> SIEM[SIEM Node]
    SIEM --> SOAR[SOAR]
    SOAR --> ITSM[ITSM]
    CLOUD[Cloud Logs] --> COL

```