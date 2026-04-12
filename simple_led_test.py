from skidl import *

# === DESIGN PARAMETERS ===
# Simple LED circuit with 330 ohm resistor
# Supply voltage: 5 V
# Target LED current: ~9 mA

# === COMPONENT INSTANTIATION ===
R1 = Part('Device', 'R', footprint='Resistor_THT:R_Axial_DIN0207_L6.3mm_D2.5mm_P10.16mm_Horizontal', value='330')
D1 = Part('Device', 'LED', footprint='LED_THT:LED_D5.0mm', value='Red LED')
J1 = Part('Connector', 'Barrel_Jack', footprint='Connector_BarrelJack:BarrelJack_Horizontal', value='5V Power Jack')

# === POWER RAIL SETUP ===
vcc = Net('VCC')
vcc.drive = POWER
gnd = Net('GND')
gnd.drive = POWER

# === SIGNAL CONNECTIONS ===
# Power jack to VCC and GND
vcc += J1[2]      # Barrel jack center pin (positive)
gnd += J1[1]      # Barrel jack sleeve (ground)

# LED circuit: VCC -> R1 -> LED -> GND
vcc += R1[1]      # Resistor to VCC
R1[2] += D1[1]    # Resistor to LED anode
gnd += D1[2]      # LED cathode to GND

# === OUTPUT ===
ERC()
generate_netlist()
generate_schematic()