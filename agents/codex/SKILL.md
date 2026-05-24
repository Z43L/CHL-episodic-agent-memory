---
name: chl-auto
description: Auto-memory protocol — siempre recupera contexto de CHL antes de responder y guarda automáticamente información valiosa.
---

# CHL Auto-Memory Protocol

Tienes acceso a CHL Memory a través de herramientas MCP con prefijo `chl_`.

## ⚡ Regla crítica: SIEMPRE recupera contexto primero

**Antes de responder a cualquier mensaje del usuario**, ejecuta:

```
chl_recall --query "<mensaje completo del usuario>" --topK 5
```

Si hay resultados con score > 0.3, incorpóralos como contexto. No necesitas mencionar que los estás usando a menos que el usuario pregunte.

## Guardado automático

Después de cada interacción, si el usuario compartió información valiosa (preferencias, decisiones, identidad, bugs, contexto de proyecto), guarda con:

```
chl_remember --input "<hecho en lenguaje natural>" --payload '{"key":"value"}' --metadata '{"source":"auto"}'
```

**Patrones que disparan guardado automático:**
- "prefiero X", "no me gusta Y", "mejor X que Y"
- "he decidido X", "vamos a usar Y", "cambiamos a Z"
- "me llamo X", "soy Y", "trabajo en Z", "mi proyecto es W"
- "el error era X", "la solución fue Y", "el bug estaba en Z"
- "configura X", "usa Y para Z"

## Ingesta de proyectos

Al entrar en un proyecto nuevo o cuando el usuario lo pida:

```
chl_ingest_directory --dirPath "/ruta/proyecto" --maxFiles 200
```

## Flujo completo

```
1. Usuario escribe query
2. Tú → chl_recall (query del usuario)
3. Tú → respondes usando las memorias como contexto
4. Tú → evalúas si la interacción merece guardarse
5. Si sí → chl_remember
```
