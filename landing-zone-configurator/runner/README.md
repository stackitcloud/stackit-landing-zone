# OpenTofu-Runner

Isolierte Laufzeit und Run-Protokoll; getrennt von API und Worker. Gepinnte Engine, Provider und Accelerator-Revision. Die Implementierungssprache des kleinen Supervisors bleibt offen; eigene Go-Laufzeit nur bei nachgewiesenem Vorteil.

Keine Backend-/Model-Serving-Bindings; nur runbezogene Kunden-Credentials und State-Zugriffe. CF-Eignung, Limits und private Konnektivität vor Implementierung nachweisen.
