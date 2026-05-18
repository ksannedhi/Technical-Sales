```mermaid
graph LR
    EP[Endpoints] --> COL[Collectors]
    COL --> SIEM[SIEM Cluster]
    SIEM --> SOAR[SOAR]
    SOAR --> ITSM[ITSM]
    CLOUD[Cloud Logs] --> COL
    SIEM --> DR[DR Site]
```