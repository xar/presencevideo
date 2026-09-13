<!DOCTYPE html>
{{--
    The headless render page.

    Deliberately not an Inertia page and deliberately almost empty: nothing here
    decides a pixel. It exists only to give the browser export bundle a secure
    origin to run in, because WebCodecs is gated on a secure context and has no
    VideoEncoder at all on a plain-http origin that is not localhost.

    The project payload is embedded as JSON rather than fetched so the render
    cannot start against a half-loaded project.
--}}
<html lang="en">
    <head>
        <meta charset="utf-8">
        <title>Headless render</title>
        <style>
            html, body { margin: 0; background: #000; }
        </style>
        <script type="application/json" id="headless-render-payload">@json($payload)</script>
        @vite(['resources/js/headless/render.ts'])
    </head>
    <body></body>
</html>
