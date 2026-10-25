import streamlit as st
import streamlit.components.v1 as components
import json
from pathlib import Path
from default_data import INITIAL_DATA

st.set_page_config(
    page_title="專業臥室空間設計 & 3D人類視角風水系統",
    page_icon="📐",
    layout="wide",
    initial_sidebar_state="collapsed"
)

st.markdown("""
<style>
    .block-container { padding: 0rem !important; max-width: 100% !important; }
    header { display: none !important; }
    footer { display: none !important; }
    iframe { height: 100dvh !important; min-height: 680px !important; border: none !important; }
</style>
""", unsafe_allow_html=True)

base_dir = Path(__file__).parent / "frontend"
css_content = (base_dir / "styles.css").read_text(encoding="utf-8")
html_body = (base_dir / "template.html").read_text(encoding="utf-8")
js_2d = (base_dir / "engine_2d.js").read_text(encoding="utf-8")
js_3d = (base_dir / "engine_3d.js").read_text(encoding="utf-8")

full_html = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/fabric.js/5.3.1/fabric.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/TransformControls.js"></script>
  <style>{css_content}</style>
</head>
<body>
  {html_body}
  <script>
    const INITIAL_CONFIG = {json.dumps(INITIAL_DATA, ensure_ascii=False)};
    {js_2d}
    {js_3d}
    window.addEventListener("load", initFabric);
  </script>
</body>
</html>"""

components.html(full_html, height=960, scrolling=False)
