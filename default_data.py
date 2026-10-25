FUJI_SVG = """data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 500' width='800' height='500'>
<defs>
  <linearGradient id='sky' x1='0' y1='0' x2='0' y2='1'>
    <stop offset='0%' stop-color='%231e3c72'/>
    <stop offset='45%' stop-color='%232a5298'/>
    <stop offset='80%' stop-color='%23f6d365'/>
    <stop offset='100%' stop-color='%23fda085'/>
  </linearGradient>
  <linearGradient id='fuji' x1='0' y1='0' x2='0' y2='1'>
    <stop offset='0%' stop-color='%233b4d71'/>
    <stop offset='100%' stop-color='%231a233a'/>
  </linearGradient>
  <linearGradient id='lake' x1='0' y1='0' x2='0' y2='1'>
    <stop offset='0%' stop-color='%232a486b'/>
    <stop offset='100%' stop-color='%230f1c2e'/>
  </linearGradient>
</defs>
<rect width='800' height='360' fill='url(%23sky)'/>
<circle cx='620' cy='130' r='55' fill='%23ffefba' opacity='0.85'/>
<ellipse cx='180' cy='240' rx='140' ry='22' fill='%23ffffff' opacity='0.25'/>
<ellipse cx='650' cy='210' rx='160' ry='18' fill='%23ffffff' opacity='0.2'/>
<path d='M 80 360 Q 290 270 355 110 L 445 110 Q 510 270 720 360 Z' fill='url(%23fuji)'/>
<path d='M 355 110 L 445 110 Q 470 175 492 215 L 460 195 L 435 225 L 408 188 L 385 225 L 358 192 L 312 215 Q 332 175 355 110 Z' fill='%23ffffff'/>
<rect y='360' width='800' height='140' fill='url(%23lake)'/>
<path d='M 220 360 Q 340 410 365 465 L 435 465 Q 460 410 580 360 Z' fill='%233b4d71' opacity='0.45'/>
<path d='M 362 435 L 438 435 L 425 465 L 375 465 Z' fill='%23ffffff' opacity='0.35'/>
<circle cx='90' cy='60' r='35' fill='%23ffb7c5' opacity='0.8'/>
<circle cx='140' cy='40' r='45' fill='%23ffc0cb' opacity='0.85'/>
<circle cx='50' cy='100' r='30' fill='%23ff9ebb' opacity='0.75'/>
</svg>"""

DEFAULT_ROOM = {
    "width": 460, "depth": 360, "height": 280,
    "editable": False,
    "lock_scale": False,
    "auto_save": False,
    "show_walls": True,
    "show_ceiling": False,
    "wall_color": "#F8FAFC",
    "ceiling_color": "#FFFFFF",
    "wall_texture": "",
    "ceiling_texture": ""
}

DEFAULT_HUMAN = {
    "x": 230, "y": 230, "z": 0,
    "height": 178,
    "rot": 0,
    "pitch": 0,
    "posture": "stand",         # "stand" | "sit" | "lie"
    "sit_mode": "bed_edge",     # "bed_edge" (坐床邊) | "chair" (坐椅子) | "free" (原地坐)
    "sit_chair_id": "chair_desk",
    "seat_h": 55,               # 目前坐姿臀部離地高度 (cm)
    "lock_horizontal": False,
    "fov_h": 100,               # 預設左右視角 100度
    "fov_up": 50,               # 預設上視角 50度
    "fov_down": 65              # 預設下視角 65度
}

DEFAULT_COMPASS = {
    "x": 230, "y": 180, "rotation": 0, "show": True, "auto_center": True,
    "show_feixing": False, "feixing_year": 2026
}

DEFAULT_VOIDS = [
    {"id": "void_1", "name": "留白處 1", "x": 370, "y": 0, "w": 90, "d": 120}
]

DEFAULT_CATEGORIES = ["床", "大型家具", "收納櫃體", "椅子", "門窗建材", "機電開關", "牆面裝飾"]

DEFAULT_ITEMS = [
    {"id": "bed", "name": "床", "category": "床", "item_type": "furniture", "x": 200, "y": 0, "z": 0, "w": 152, "d": 195, "h": 55, "seat_h": 55, "rot": 0, "color": "#FAD785", "texture": "", "scenery": "", "flip_x": False, "flip_y": False},
    {"id": "stand_l", "name": "床頭櫃(左)", "category": "收納櫃體", "item_type": "furniture", "x": 175, "y": 0, "z": 0, "w": 25, "d": 40, "h": 45, "seat_h": 45, "rot": 0, "color": "#FAD785", "texture": "", "scenery": "", "flip_x": False, "flip_y": False},
    {"id": "stand_r", "name": "床頭櫃(右)", "category": "收納櫃體", "item_type": "furniture", "x": 352, "y": 0, "z": 0, "w": 25, "d": 40, "h": 45, "seat_h": 45, "rot": 0, "color": "#FAD785", "texture": "", "scenery": "", "flip_x": False, "flip_y": False},
    {"id": "wardrobe_new", "name": "新衣櫃", "category": "收納櫃體", "item_type": "furniture", "x": 0, "y": 0, "z": 0, "w": 121, "d": 72, "h": 210, "seat_h": 30, "rot": 0, "color": "#A0CB88", "texture": "", "scenery": "", "flip_x": False, "flip_y": False},
    {"id": "desk", "name": "書桌", "category": "大型家具", "item_type": "furniture", "x": 0, "y": 135, "z": 0, "w": 123, "d": 71, "h": 75, "seat_h": 75, "rot": 0, "color": "#8232FA", "texture": "", "scenery": "", "flip_x": False, "flip_y": False},
    {"id": "chair_desk", "name": "書桌椅", "category": "椅子", "item_type": "chair", "x": 35, "y": 210, "z": 0, "w": 50, "d": 50, "h": 85, "seat_h": 45, "rot": 0, "color": "#38BDF8", "texture": "", "scenery": "", "flip_x": False, "flip_y": False},
    {"id": "drybox", "name": "防潮箱", "category": "收納櫃體", "item_type": "furniture", "x": 235, "y": 315, "z": 0, "w": 40, "d": 45, "h": 50, "seat_h": 50, "rot": 0, "color": "#DC7CF5", "texture": "", "scenery": "", "flip_x": False, "flip_y": False},
    {"id": "wardrobe_white", "name": "白衣櫃", "category": "收納櫃體", "item_type": "furniture", "x": 275, "y": 305, "z": 0, "w": 60, "d": 55, "h": 190, "seat_h": 30, "rot": 0, "color": "#AADE8D", "texture": "", "scenery": "", "flip_x": False, "flip_y": False},
    {"id": "wardrobe_old", "name": "舊衣櫃", "category": "收納櫃體", "item_type": "furniture", "x": 335, "y": 299, "z": 0, "w": 120, "d": 61, "h": 200, "seat_h": 30, "rot": 0, "color": "#9EC484", "texture": "", "scenery": "", "flip_x": False, "flip_y": False},
    {"id": "bookcase", "name": "玻書櫃", "category": "收納櫃體", "item_type": "furniture", "x": 428, "y": 120, "z": 0, "w": 32, "d": 63, "h": 180, "seat_h": 30, "rot": 0, "color": "#DC7CF5", "texture": "", "scenery": "", "flip_x": False, "flip_y": False},
    {"id": "win_main", "name": "窗戶", "category": "門窗建材", "item_type": "window", "x": 35, "y": 360, "z": 85, "w": 135, "d": 12, "h": 130, "seat_h": 0, "rot": 0, "color": "#F59E0B", "texture": "", "scenery": FUJI_SVG, "flip_x": False, "flip_y": False, "wall": "south"},
    {"id": "socket_wall", "name": "插座", "category": "機電開關", "item_type": "socket", "x": 325, "y": 360, "z": 35, "w": 22, "d": 12, "h": 14, "seat_h": 0, "rot": 0, "color": "#F97316", "texture": "", "scenery": "", "flip_x": False, "flip_y": False, "wall": "south"}
]

INITIAL_DATA = {
    "room": DEFAULT_ROOM,
    "human": DEFAULT_HUMAN,
    "compass": DEFAULT_COMPASS,
    "voids": DEFAULT_VOIDS,
    "categories": DEFAULT_CATEGORIES,
    "items": DEFAULT_ITEMS,
    "default_fuji": FUJI_SVG,
    "recent_colors": ["#38BDF8", "#FAD785", "#A0CB88", "#8232FA", "#F59E0B"],
    "recent_border_colors": ["#1E293B", "#10B981", "#F59E0B", "#94A3B8", "#451A03"]
}