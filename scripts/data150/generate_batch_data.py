#!/usr/bin/env python3
"""
DATA150 Clean Generator:
Generates 150 synthetic rows for each of the 70 applicable business tables for tenant FORNEXA.
Strictly adheres to:
- DATA150-SCHEMA-BASELINE.json (0 invented columns, 100% baseline column match).
- Zero contact phones (NULL).
- Non-deliverable RFC 2606 emails (@fornexatest.invalid).
- 150 distinct logistics points across Spain/Europe.
- Deterministic UUIDv5 primary keys and composite keys.
- Accurate enum values according to CHECK constraints in schema.
- Built-in validation check using preflight_schema_validation.
"""
import json
import uuid
import datetime
import hashlib
from pathlib import Path

TENANT_ID = '00000000-0000-4000-8000-000000000001'
BATCH_ID = 'DATA150-PRODUCTION-20261009'
NAMESPACE = uuid.UUID('6ba7b810-9dad-11d1-80b4-00c04fd430c8')

def gen_uuid(entity_name: str, index: int) -> str:
    return str(uuid.uuid5(NAMESPACE, f'DATA150:{entity_name}:{index}'))

BASE_TIME = datetime.datetime(2026, 10, 14, 8, 0, 0, tzinfo=datetime.timezone.utc)

def calc_gs1_check(prefix: str) -> int:
    digits = [int(c) for c in prefix]
    rev = digits[::-1]
    s = sum(d * (3 if i % 2 == 0 else 1) for i, d in enumerate(rev))
    return (10 - (s % 10)) % 10

def gen_gs1_13(i: int, prefix7: str = '8412345') -> str:
    pref12 = f"{prefix7}{i:05d}"
    check = calc_gs1_check(pref12)
    return f"{pref12}{check}"

def make_synthetic_pdf_bytes(artifact_id: str, index: int, cmr_id: str, kind: str, scope: str) -> bytes:
    stream_text = (
        f"BT\n"
        f"/F1 14 Tf\n"
        f"40 750 Td\n"
        f"([PRUEBA] Documento Regulatorio Sintetico FORNEXA) Tj\n"
        f"0 -24 Td\n"
        f"/F1 10 Tf\n"
        f"(Tipo: {kind} | Ambito: {scope} | Version: 1) Tj\n"
        f"0 -18 Td\n"
        f"(Artifact ID: {artifact_id}) Tj\n"
        f"0 -18 Td\n"
        f"(CMR Asociado: {cmr_id}) Tj\n"
        f"0 -18 Td\n"
        f"(Lote: DATA150-PRODUCTION-20261009 | Fila: {index:03d}/150) Tj\n"
        f"0 -24 Td\n"
        f"(Documento de ensayo sintetico generado para verificacion de flujos) Tj\n"
        f"ET\n"
    ).encode('latin-1')

    stream_len = len(stream_text)

    parts = [
        b"%PDF-1.4\n",
        b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
        b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
        b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n",
        f"4 0 obj\n<< /Length {stream_len} >>\nstream\n".encode('latin-1') + stream_text + b"endstream\nendobj\n",
        b"5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n"
    ]

    obj_offsets = []
    curr = len(parts[0])
    for p in parts[1:]:
        obj_offsets.append(curr)
        curr += len(p)

    xref_offset = curr
    xref = b"xref\n0 6\n0000000000 65535 f \n"
    for off in obj_offsets:
        xref += f"{off:010d} 00000 n \n".encode('latin-1')

    trailer = f"trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n".encode('latin-1')
    return b"".join(parts) + xref + trailer

SYNTHETIC_JPEG_BYTES = (
    b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00H\x00H\x00\x00\xff\xdb\x00C\x00\x08\x06\x06\x07\x06\x05\x08"
    b"\x07\x07\x07\t\t\x08\n\x0c\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13\x0f\x14\x1d\x1a\x1f\x1e\x1d\x1a\x1c\x1c $.' \",#"
    b"\x1c\x1c(7),01444\x1f'9=82<.342\xff\xc0\x00\x0b\x08\x00\x01\x00\x01\x01\x01\x11\x00\xff\xc4\x00\x1f\x00\x00"
    b"\x01\x05\x01\x01\x01\x01\x01\x01\x00\x00\x00\x00\x00\x00\x00\x00\x01\x02\x03\x04\x05\x06\x07\x08\t\n\x0b\xff"
    b"\xda\x00\x08\x01\x01\x00\x00?\x00\xbf\x00\xff\xd9"
)

def get_cycle_timeline(i: int) -> dict:
    days_back = (149 - i) * 0.18
    cycle_dt = BASE_TIME - datetime.timedelta(
        days=days_back,
        hours=(i * 3) % 24,
        minutes=(i * 7) % 60,
        seconds=(i * 11) % 60
    )

    t_master_created = cycle_dt - datetime.timedelta(days=1, hours=2)
    t_master_updated = t_master_created + datetime.timedelta(hours=1)

    t_order_created = cycle_dt
    t_order_updated = t_order_created + datetime.timedelta(minutes=15)

    t_pickup_start = t_order_created + datetime.timedelta(hours=1)
    t_pickup_end = t_pickup_start + datetime.timedelta(hours=2)
    t_delivery_start = t_pickup_end + datetime.timedelta(hours=4)
    t_delivery_end = t_delivery_start + datetime.timedelta(hours=2)

    t_expedition_created = t_order_created + datetime.timedelta(hours=1, minutes=30)
    t_expedition_updated = t_expedition_created + datetime.timedelta(minutes=20)

    t_trip_created = t_expedition_created + datetime.timedelta(hours=1)
    t_trip_updated = t_trip_created + datetime.timedelta(minutes=30)

    t_trip_planned_start = t_trip_created + datetime.timedelta(hours=2)
    t_trip_actual_start = t_trip_planned_start + datetime.timedelta(minutes=10)
    t_trip_planned_end = t_trip_actual_start + datetime.timedelta(hours=6)
    t_trip_actual_end = t_trip_planned_end + datetime.timedelta(minutes=15)

    t_stop_arrived = t_trip_actual_start + datetime.timedelta(hours=2)
    t_stop_completed = t_stop_arrived + datetime.timedelta(minutes=45)

    t_cmr_issued = t_trip_actual_start + datetime.timedelta(minutes=15)
    t_cmr_created = t_cmr_issued
    t_cmr_updated = t_cmr_created + datetime.timedelta(minutes=10)

    t_event_occurred = t_stop_arrived + datetime.timedelta(minutes=20)
    t_event_created = t_event_occurred + datetime.timedelta(seconds=5)

    t_movement_requested = t_order_created + datetime.timedelta(minutes=30)
    t_movement_started = t_movement_requested + datetime.timedelta(minutes=10)
    t_movement_completed = t_movement_started + datetime.timedelta(minutes=25)

    t_customs_occurred = t_trip_actual_start + datetime.timedelta(hours=1)
    t_customs_created = t_customs_occurred + datetime.timedelta(minutes=5)

    return {
        'master_created': t_master_created.isoformat(),
        'master_updated': t_master_updated.isoformat(),
        'order_created': t_order_created.isoformat(),
        'order_updated': t_order_updated.isoformat(),
        'pickup_start': t_pickup_start.isoformat(),
        'pickup_end': t_pickup_end.isoformat(),
        'delivery_start': t_delivery_start.isoformat(),
        'delivery_end': t_delivery_end.isoformat(),
        'expedition_created': t_expedition_created.isoformat(),
        'expedition_updated': t_expedition_updated.isoformat(),
        'trip_created': t_trip_created.isoformat(),
        'trip_updated': t_trip_updated.isoformat(),
        'trip_planned_start': t_trip_planned_start.isoformat(),
        'trip_actual_start': t_trip_actual_start.isoformat(),
        'trip_planned_end': t_trip_planned_end.isoformat(),
        'trip_actual_end': t_trip_actual_end.isoformat(),
        'stop_arrived': t_stop_arrived.isoformat(),
        'stop_completed': t_stop_completed.isoformat(),
        'cmr_issued': t_cmr_issued.isoformat(),
        'cmr_created': t_cmr_created.isoformat(),
        'cmr_updated': t_cmr_updated.isoformat(),
        'event_occurred': t_event_occurred.isoformat(),
        'event_created': t_event_created.isoformat(),
        'movement_requested': t_movement_requested.isoformat(),
        'movement_started': t_movement_started.isoformat(),
        'movement_completed': t_movement_completed.isoformat(),
        'customs_occurred': t_customs_occurred.isoformat(),
        'customs_created': t_customs_created.isoformat(),
    }

# 50 Spanish logistics hubs used to generate 150 unique street addresses
provinces_data = [
    ('Madrid', 'Madrid', '28053', 'Centro de Transportes de Madrid, C/ Eje 1 Nave %d', 40.3621, -3.6652),
    ('Madrid', 'Getafe', '28906', 'Polígono Los Gavilanes, C/ Rosalind Franklin %d', 40.2981, -3.6841),
    ('Madrid', 'San Fernando de Henares', '28830', 'Polígono San Fernando II, Av. de Castilla %d', 40.4489, -3.5122),
    ('Madrid', 'Coslada', '28821', 'Centro de Carga Aérea, Av. Central %d', 40.4532, -3.5412),
    ('Madrid', 'Fuenlabrada', '28947', 'Polígono Cobo Calleja, C/ Bembibre %d', 40.2612, -3.7481),
    ('Madrid', 'Pinto', '28320', 'Polígono Las Arenas, C/ Águilas %d', 40.2412, -3.6912),
    ('Barcelona', 'Barcelona', '08040', 'ZAL Port de Barcelona, Av. Ports d Europa %d', 41.3321, 2.1281),
    ('Barcelona', 'El Prat de Llobregat', '08820', 'Parc Logístic de la Zona Franca, C/ A %d', 41.3211, 2.0942),
    ('Barcelona', 'Sant Boi de Llobregat', '08830', 'Polígon Industrial Les Salines, C/ Tarragona %d', 41.3452, 2.0412),
    ('Barcelona', 'Martorell', '08760', 'Polígon Congost, Av. del Congost %d', 41.4721, 1.9212),
    ('Barcelona', 'Granollers', '08403', 'Polígon Palou Nord, C/ Camí Ral %d', 41.5912, 2.2812),
    ('Valencia', 'Riba-roja de Túria', '46190', 'Sector 13 Llogístic, C/ Mallorca %d', 39.5412, -0.5621),
    ('Valencia', 'Cheste', '46380', 'Parque Empresarial Cheste, C/ Vía 1 %d', 39.4981, -0.6621),
    ('Valencia', 'Almussafes', '46440', 'Polígono Industrial Juan Carlos I, Av. de la Foia %d', 39.2981, -0.4212),
    ('Valencia', 'Paterna', '46980', 'Parque Tecnológico de Valencia, C/ Leonardo Da Vinci %d', 39.5212, -0.4612),
    ('Zaragoza', 'Zaragoza', '50197', 'Plataforma Logística PLAZA, C/ Bari %d', 41.6321, -0.9912),
    ('Zaragoza', 'Zaragoza', '50014', 'Polígono Malpica, C/ F Oeste %d', 41.6512, -0.8212),
    ('Zaragoza', 'La Muela', '50196', 'Polígono Industrial Centrovía, C/ Buenos Aires %d', 41.5812, -1.0981),
    ('Sevilla', 'Dos Hermanas', '41703', 'Polígono Industrial La Isla, C/ Torre de los Herberos %d', 37.2812, -5.9412),
    ('Sevilla', 'Sevilla', '41020', 'Polígono Industrial Carretera Amarilla, C/ Comercio %d', 37.3912, -5.9512),
    ('Alava', 'Vitoria-Gasteiz', '01015', 'Polígono Industrial Jundiz, C/ Lermandabidea %d', 42.8412, -2.7212),
    ('Gipuzkoa', 'Irun', '20305', 'Centro Transporte Integral ZAISA, C/ Aduana %d', 43.3412, -1.7812),
    ('Bizkaia', 'Santurtzi', '48980', 'Puerto de Bilbao Zierbena, Muelle Reina Sofía %d', 43.3512, -3.0412),
    ('Navarra', 'Pamplona', '31110', 'Polígono Industrial Noáin-Esquíroz, C/ Real %d', 42.7612, -1.6412),
    ('Toledo', 'Illescas', '45200', 'Plataforma Central Iberum, C/ Lituania %d', 40.1281, -3.8412),
    ('Guadalajara', 'Alovera', '19208', 'Parque Casablanca, Av. del Río Henares %d', 40.5812, -3.2412),
    ('Guadalajara', 'Cabanillas del Campo', '19171', 'Polígono Cantos Blancos, C/ Francisco Medina %d', 40.6312, -3.2212),
    ('Valladolid', 'Valladolid', '47012', 'Polígono Industrial San Cristóbal, C/ Topacio %d', 41.6312, -4.7012),
    ('Murcia', 'Murcia', '30169', 'Polígono Industrial Oeste, C/ Principal %d', 37.9512, -1.1812),
    ('Alicante', 'Alicante', '03114', 'Polígono Industrial Las Atalayas, C/ del Trigo %d', 38.3512, -0.5412),
    ('Malaga', 'Malaga', '29004', 'Polígono Industrial Guadalhorce, C/ Esteban Salazar %d', 36.6912, -4.4712),
    ('Cadiz', 'Algeciras', '11207', 'Muelle Isla Verde Exterior, Terminal de Contenedores %d', 36.1212, -5.4312),
    ('Girona', 'La Jonquera', '17700', 'Polígon Camp dels Arbres, C/ Duana %d', 42.4181, 2.8712),
    ('A Coruna', 'Arteixo', '15142', 'Polígono Industrial Sabón, Av. de la Prensa %d', 43.3112, -8.5112),
    ('Pontevedra', 'Vigo', '36215', 'Polígono Tecnolóxico e Industrial do Valladares, C/ A %d', 42.1812, -8.7012),
    ('Asturias', 'Gijon', '33211', 'Polígono Industrial Mora Garay, C/ Carpinteros %d', 43.5212, -5.6912),
    ('Cantabria', 'Santander', '39011', 'Polígono Industrial Candina, C/ Comercio %d', 43.4412, -3.8312),
    ('Burgos', 'Burgos', '09007', 'Polígono Industrial Gamonal-Villímar, C/ Alcalde Martín %d', 42.3612, -3.6512),
    ('Leon', 'Leon', '24009', 'Polígono Industrial Onzonilla, C/ 1 %d', 42.5412, -5.5812),
    ('Castellon', 'Castellon de la Plana', '12006', 'Polígono Industrial Ciudad del Transporte, C/ Gran Bretaña %d', 39.9712, -0.0612),
    ('Tarragona', 'Tarragona', '43006', 'Polígon Industrial Francolí, C/ E %d', 41.1212, 1.2212),
    ('Cordoba', 'Cordoba', '14014', 'Polígono Industrial Las Quemadas, C/ José de Gálvez %d', 37.9012, -4.7212),
    ('Granada', 'Granada', '18015', 'Polígono Industrial Asegra, C/ Peligros %d', 37.2212, -3.6312),
    ('Badajoz', 'Badajoz', '06008', 'Polígono Industrial El Nevero, C/ Nevero %d', 38.8912, -6.9912),
    ('Albacete', 'Albacete', '02007', 'Parque Empresarial Campollano, C/ Autovía %d', 38.9981, -1.8612),
    ('Ciudad Real', 'Manzanares', '13200', 'Polígono Industrial de Manzanares, C/ Vía %d', 38.9912, -3.3712),
    ('Huelva', 'Huelva', '21007', 'Polígono Industrial Tartessos, C/ C %d', 37.2612, -6.9312),
    ('Lleida', 'Lleida', '25191', 'Polígon Industrial El Segre, C/ Josep Baró %d', 41.6212, 0.6412),
    ('Jaen', 'Bailen', '23710', 'Polígono Industrial Guadiel, C/ Bailén %d', 38.1012, -3.7812),
    ('Ourense', 'San Cibrao das Vinas', '32901', 'Polígono San Cibrao das Viñas, C/ 1 %d', 42.2912, -7.8612),
]

unique_addresses = []
for i in range(150):
    prov, city, cp, street_template, base_lat, base_lon = provinces_data[i % len(provinces_data)]
    num = (i // len(provinces_data)) + 1
    street = street_template % (num * 10 + (i % 7))
    lat = round(base_lat + (i * 0.0012) % 0.05, 5)
    lon = round(base_lon + (i * 0.0015) % 0.05, 5)
    unique_addresses.append({
        'address_line1': street,
        'city': city,
        'postal_code': cp,
        'region': prov,
        'country_code': 'ES',
        'latitude': lat,
        'longitude': lon
    })

company_sectors = [
    'Logística', 'Transportes', 'Distribuciones', 'Almacenajes', 'Cargas',
    'Transitaría', 'Paquetería', 'Operador Logístico', 'Supply Chain', 'Envíos'
]
regions_names = [
    'Ibérica', 'del Norte', 'Mediterráneo', 'del Sur', 'Central',
    'de Levante', 'Occidental', 'del Ebro', 'Atlántica', 'Continental'
]

def generate_all_tables():
    timelines = [get_cycle_timeline(i) for i in range(150)]
    d_now = '2026-10-09'
    event_types = ['cmr_issued', 'stop_arrived', 'stop_completed', 'work_finished']
    dataset = {}

    # --- LAYER 1: Independent Root Tables (12 tables) ---

    # 1. tariff_zones
    dataset['tariff_zones'] = [
        {
            'id': gen_uuid('tariff_zones', i),
            'tenant_id': TENANT_ID,
            'name': f"[PRUEBA] Zona {regions_names[i % len(regions_names)]} {i:03d}",
            'country': 'ES',
            'purpose': f"Distribución regional {i:03d}",
            'created_at': timelines[i]['master_created'],
            'updated_at': timelines[i]['master_updated']
        } for i in range(150)
    ]

    # 2. operational_events (identity PK)
    dataset['operational_events'] = [
        {
            'tenant_id': TENANT_ID,
            'entity_type': 'DATA150_BATCH',
            'entity_id': gen_uuid('parties', i),
            'entity_code': f"DATA150-EVT-{i:04d}",
            'event_type': 'SYNTHETIC_BATCH_RECORD',
            'actor_user_id': None,
            'source': 'DATA150_SYSTEM',
            'occurred_at': timelines[i]['order_created'],
            'data': {'batch': BATCH_ID, 'index': i, 'synthetic': True},
            'created_at': timelines[i]['order_created']
        } for i in range(150)
    ]

    # 3. local_storage_sync_runs
    dataset['local_storage_sync_runs'] = [
        {
            'id': gen_uuid('local_storage_sync_runs', i),
            'tenant_id': TENANT_ID,
            'source_origin': 'DATA150_FIXTURE',
            'status': 'COMPLETED',
            'storage_keys': 1,
            'source_items': 1,
            'normalized_records': 1,
            'summary': {'batch': BATCH_ID, 'run_index': i},
            'error_message': None,
            'started_at': timelines[i]['master_created'],
            'completed_at': timelines[i]['master_updated']
        } for i in range(150)
    ]

    # 4. external_identifiers
    dataset['external_identifiers'] = [
        {
            'id': gen_uuid('external_identifiers', i),
            'tenant_id': TENANT_ID,
            'system_code': 'ERP_SAP',
            'entity_type': 'PARTY',
            'canonical_id': gen_uuid('parties', i),
            'external_id': f"SAP-PTY-{i:05d}",
            'company_scope': 'FORNEXA',
            'created_at': timelines[i]['master_created'],
            'updated_at': timelines[i]['master_updated']
        } for i in range(150)
    ]

    # 5. customs_cases
    dataset['customs_cases'] = [
        {
            'id': gen_uuid('customs_cases', i),
            'tenant_id': TENANT_ID,
            'reference': f"DUA-2026-{i:05d}",
            'country_code': 'ES',
            'direction': 'import',
            'system': 'HUA',
            'status': 'PRESENTADO',
            'mrn': f"26ES000000000{i:05d}P",
            'declarant_eori': 'ESB99999999',
            'representative_eori': None,
            'payload': {'batch': BATCH_ID, 'case_index': i},
            'created_at': timelines[i]['customs_created'],
            'updated_at': timelines[i]['customs_created']
        } for i in range(150)
    ]

    # 6. connectors
    dataset['connectors'] = [
        {
            'id': gen_uuid('connectors', i),
            'tenant_id': TENANT_ID,
            'code': f"CONN-PRUEBA-{i:03d}",
            'category': 'TRACKING',
            'provider': 'TEST_PROVIDER',
            'status': 'DISABLED',
            'configuration': {'batch': BATCH_ID, 'synthetic': True, 'inert': True, 'mock': True, 'note': 'Inert test connector fixture - disabled'},
            'last_health_at': timelines[i]['master_updated'],
            'created_at': timelines[i]['master_created'],
            'updated_at': timelines[i]['master_updated']
        } for i in range(150)
    ]

    # 7. parties
    dataset['parties'] = [
        {
            'id': gen_uuid('parties', i),
            'tenant_id': TENANT_ID,
            'code': f"PRV-PTY-{i:04d}",
            'legal_name': f"[PRUEBA] {company_sectors[i % len(company_sectors)]} {regions_names[i % len(regions_names)]} {i:03d} S.L.",
            'trade_name': f"Logística {regions_names[i % len(regions_names)]} {i:03d}",
            'tax_id': f"B99{i:06d}",
            'country_code': 'ES',
            'language': 'es',
            'currency': 'EUR',
            'is_customer': True if i < 100 else False,
            'is_supplier': True if i >= 100 else False,
            'is_carrier': True if (i % 3 == 0) else False,
            'is_shipper': True,
            'is_consignee': True,
            'adr_control': False,
            'status': 'ACTIVE',
            'metadata': {'batch': BATCH_ID, 'index': i},
            'created_at': timelines[i]['master_created'],
            'updated_at': timelines[i]['master_updated'],
            'eori': f"ESB99{i:06d}",
            'gln': gen_gs1_13(i, '8412345'),
            'cnae_code': '5229',
            'commercial_register': f"R.M. Madrid Tomo {i+1000} Folio 12",
            'business_group_party_id': None,
            'billing_party_id': None,
            'account_manager_user_id': None,
            'parent_party_id': None,
            'tax_id_type': 'NIF_IVA'
        } for i in range(150)
    ]

    # 8. fuel_indices
    dataset['fuel_indices'] = [
        {
            'id': gen_uuid('fuel_indices', i),
            'tenant_id': TENANT_ID,
            'party_id': gen_uuid('parties', i),
            'name': f"[PRUEBA] Índice Gasóleo Profesional {i:03d}",
            'currency': 'EUR',
            'created_at': timelines[i]['master_created'],
            'updated_at': timelines[i]['master_updated']
        } for i in range(150)
    ]

    # 9. vehicles
    dataset['vehicles'] = [
        {
            'id': gen_uuid('vehicles', i),
            'tenant_id': TENANT_ID,
            'owner_party_id': gen_uuid('parties', i),
            'registration': f"99{i:02d}XYZ",
            'vehicle_type': 'TRACTORA',
            'capacity_weight': 24000.0,
            'capacity_volume': 85.0,
            'adr_enabled': False,
            'status': 'AVAILABLE',
            'telematics_provider': None,
            'telematics_external_id': None,
            'metadata': {'batch': BATCH_ID, 'index': i},
            'created_at': timelines[i]['master_created'],
            'updated_at': timelines[i]['master_updated']
        } for i in range(150)
    ]

    # 10. drivers
    dataset['drivers'] = [
        {
            'id': gen_uuid('drivers', i),
            'tenant_id': TENANT_ID,
            'supplier_party_id': gen_uuid('parties', i),
            'user_id': None,
            'code': f"DRV-PRV-{i:04d}",
            'name': f"[PRUEBA] Conductor Profesional {i:03d}",
            'phone': None,
            'email': f"conductor_{i:03d}@fornexatest.invalid",
            'licence_number': f"ES-B99{i:06d}",
            'adr_qualified': False,
            'status': 'ACTIVE',
            'created_at': timelines[i]['master_created'],
            'updated_at': timelines[i]['master_updated']
        } for i in range(150)
    ]

    # 11. products
    dataset['products'] = [
        {
            'id': gen_uuid('products', i),
            'tenant_id': TENANT_ID,
            'customer_id': gen_uuid('parties', i % 100),
            'sku': f"SKU-PRV-{i:05d}",
            'name': f"[PRUEBA] Mercancía Industrial Ref {i:03d}",
            'hazard_status': 'NON_HAZARDOUS',
            'status': 'ACTIVE',
            'metadata': {'batch': BATCH_ID, 'index': i},
            'revision_number': 1,
            'created_at': timelines[i]['master_created'],
            'updated_at': timelines[i]['master_updated'],
            'owner_party_id': gen_uuid('parties', i % 100),
            'description': f"Producto estándar paletizado modelo {i:03d}",
            'category_code': 'GENERAL_CARGO',
            'gtin': gen_gs1_13(i, '8412345'),
            'hs_code': '84713000',
            'uom_base': 'UN',
            'net_weight_kg': 10.5,
            'gross_weight_kg': 12.0,
            'length_cm': 40.0,
            'width_cm': 30.0,
            'height_cm': 25.0,
            'volume_m3': 0.03,
            'is_hazardous': False,
            'is_temperature_controlled': False,
            'temp_min_c': None,
            'temp_max_c': None,
            'shelf_life_days': 365,
            'is_batch_managed': False,
            'is_serial_managed': False
        } for i in range(150)
    ]

    # 12. service_catalog
    dataset['service_catalog'] = [
        {
            'id': gen_uuid('service_catalog', i),
            'tenant_id': TENANT_ID,
            'code': f"SRV-PRV-{i:04d}",
            'name': f"[PRUEBA] Servicio Porte Nacional {i:03d}",
            'description': f"Transporte terrestre en carga completa {i:03d}",
            'mode': 'ROAD',
            'service_type': 'FTL',
            'unit': 'SHIPMENT',
            'is_active': True,
            'metadata': {'batch': BATCH_ID, 'index': i},
            'created_at': timelines[i]['master_created'],
            'updated_at': timelines[i]['master_updated']
        } for i in range(150)
    ]

    # --- LAYER 2: First-tier Dependents (17 tables) ---

    # 13. local_storage_imports
    dataset['local_storage_imports'] = [
        {
            'id': gen_uuid('local_storage_imports', i),
            'tenant_id': TENANT_ID,
            'source_origin': 'DATA150_FIXTURE',
            'storage_key': f"fornexa:data150:test:{i:04d}",
            'item_key': f"item-{i:04d}",
            'content_hash': f"hash_data150_{i:04d}",
            'payload': {'batch': BATCH_ID, 'imported_item': i},
            'normalized_entity_type': 'PARTY',
            'normalized_entity_id': gen_uuid('parties', i),
            'first_seen_at': timelines[i]['master_created'],
            'last_synced_at': timelines[i]['master_updated']
        } for i in range(150)
    ]

    # 14. tariff_zone_members
    dataset['tariff_zone_members'] = [
        {
            'id': gen_uuid('tariff_zone_members', i),
            'tenant_id': TENANT_ID,
            'zone_id': gen_uuid('tariff_zones', i),
            'member_type': 'COUNTRY',
            'country': 'ES',
            'admin_division_code': None,
            'postal_code': None,
            'postal_range_from': None,
            'postal_range_to': None,
            'postal_prefix': None,
            'excluded': False,
            'created_at': timelines[i]['master_created']
        } for i in range(150)
    ]

    # 15. tariff_headers
    dataset['tariff_headers'] = [
        {
            'id': gen_uuid('tariff_headers', i),
            'tenant_id': TENANT_ID,
            'code': f"TRF-PRV-{i:04d}",
            'name': f"[PRUEBA] Tarifa Transporte Regional {i:03d}",
            'status': 'ACTIVE',
            'version': 1,
            'valid_from': '2026-01-01',
            'valid_to': '2026-12-31',
            'currency': 'EUR',
            'priority': 10,
            'service_id': gen_uuid('service_catalog', i),
            'origin_country': 'ES',
            'destination_country': 'ES',
            'superseded_by_id': None,
            'created_by': None,
            'approved_by': None,
            'approved_at': None,
            'created_at': timelines[i]['master_created'],
            'updated_at': timelines[i]['master_updated'],
            'kind': 'SELL',
            'origin_zone_id': gen_uuid('tariff_zones', i),
            'destination_zone_id': gen_uuid('tariff_zones', (i + 1) % 150)
        } for i in range(150)
    ]

    # 16. connector_events
    dataset['connector_events'] = [
        {
            'id': gen_uuid('connector_events', i),
            'tenant_id': TENANT_ID,
            'connector_id': gen_uuid('connectors', i),
            'direction': 'INBOUND',
            'event_type': 'PING',
            'status': 'OK',
            'external_reference': f"EXT-EVT-{i:05d}",
            'payload': {'batch': BATCH_ID, 'ping': True},
            'error_message': None,
            'occurred_at': timelines[i]['master_created'],
            'created_at': timelines[i]['master_created']
        } for i in range(150)
    ]

    # 17. customs_messages
    dataset['customs_messages'] = [
        {
            'id': gen_uuid('customs_messages', i),
            'tenant_id': TENANT_ID,
            'case_id': gen_uuid('customs_cases', i),
            'correlation_id': gen_uuid('customs_messages_corr', i),
            'direction': 'outbound',
            'system': 'HUA',
            'message_type': 'CC515C',
            'environment': 'PRE',
            'status': 'SENT',
            'xml_payload': f'<Message id="{i}"><Batch>DATA150</Batch></Message>',
            'http_status': 200,
            'error_codes': [],
            'created_at': timelines[i]['customs_created'],
            'processed_at': timelines[i]['customs_created']
        } for i in range(150)
    ]

    # 18. customs_events (identity PK)
    dataset['customs_events'] = [
        {
            'tenant_id': TENANT_ID,
            'case_id': gen_uuid('customs_cases', i),
            'event_type': 'CASE_INITIALIZED',
            'actor_id': None,
            'data': {'batch': BATCH_ID, 'status': 'PRESENTADO'},
            'created_at': timelines[i]['customs_created']
        } for i in range(150)
    ]

    # 19. communications
    dataset['communications'] = [
        {
            'id': gen_uuid('communications', i),
            'tenant_id': TENANT_ID,
            'channel': 'EMAIL',
            'direction': 'OUTBOUND',
            'party_id': gen_uuid('parties', i),
            'related_entity_type': 'ORDER',
            'related_entity_id': None,
            'recipient': f"notificaciones_{i:03d}@fornexatest.invalid",
            'subject': f"[PRUEBA] Notificación Expedición {i:03d}",
            'provider': 'MOCK_MAILER',
            'provider_message_id': f"MSG-{i:05d}",
            'status': 'SENT',
            'payload': {'batch': BATCH_ID, 'body': f"Mensaje sintético {i:03d}"},
            'error_message': None,
            'sent_at': timelines[i]['order_updated'],
            'created_at': timelines[i]['order_updated']
        } for i in range(150)
    ]

    # 20. party_contacts
    dataset['party_contacts'] = [
        {
            'id': gen_uuid('party_contacts', i),
            'tenant_id': TENANT_ID,
            'party_id': gen_uuid('parties', i),
            'name': f"[PRUEBA] Gestor Tráfico {i:03d}",
            'role': 'Responsable Logístico',
            'phone': None,
            'email': f"contacto_{i:03d}@fornexatest.invalid",
            'is_primary': True,
            'is_active': True,
            'created_at': timelines[i]['master_created'],
            'updated_at': timelines[i]['master_updated'],
            'department': 'Operaciones',
            'language': 'es',
            'schedule': {'dias': 'L-V', 'horario': '08:00-18:00'},
            'notification_channels': ['EMAIL'],
            'valid_from': '2026-01-01',
            'valid_to': None
        } for i in range(150)
    ]

    # 21. party_addresses (150 distinct points across Spain)
    dataset['party_addresses'] = [
        {
            'id': gen_uuid('party_addresses', i),
            'tenant_id': TENANT_ID,
            'party_id': gen_uuid('parties', i),
            'code': f"ADDR-PRV-{i:04d}",
            'address_type': 'OPERATING',
            'name': f"[PRUEBA] Plataforma Logística {unique_addresses[i]['city']} {i:03d}",
            'address_line1': unique_addresses[i]['address_line1'],
            'address_line2': f"Muelle {i % 12 + 1}",
            'postal_code': unique_addresses[i]['postal_code'],
            'city': unique_addresses[i]['city'],
            'region': unique_addresses[i]['region'],
            'country_code': unique_addresses[i]['country_code'],
            'latitude': unique_addresses[i]['latitude'],
            'longitude': unique_addresses[i]['longitude'],
            'contact_name': f"[PRUEBA] Jefe de Muelle {i:03d}",
            'contact_phone': None,
            'contact_email': f"muelle_{i:03d}@fornexatest.invalid",
            'default_window_start': '08:00:00',
            'default_window_end': '18:00:00',
            'instructions': 'Acceso por puerta principal previa identificación',
            'is_active': True,
            'created_at': timelines[i]['master_created'],
            'updated_at': timelines[i]['master_updated'],
            'subdivision_key': unique_addresses[i]['postal_code'][:2]
        } for i in range(150)
    ]

    # 22. party_adr_profiles
    dataset['party_adr_profiles'] = [
        {
            'party_id': gen_uuid('parties', i),
            'tenant_id': TENANT_ID,
            'frequency': 'NEVER',
            'validation_policy': 'INFO',
            'preferred_classes': [],
            'updated_at': timelines[i]['master_updated'],
            'updated_by': None
        } for i in range(150)
    ]

    # 23. customer_billing_profiles
    dataset['customer_billing_profiles'] = [
        {
            'party_id': gen_uuid('parties', i),
            'tenant_id': TENANT_ID,
            'payment_method': 'TRANSFER',
            'payment_terms_days': 30,
            'credit_limit': 50000.0,
            'credit_insurance': False,
            'invoice_grouping': 'MONTHLY',
            'requires_order_reference': True,
            'tax_regime': 'GENERAL',
            'invoice_channel': 'EMAIL',
            'billing_email': f"facturacion_{i:03d}@fornexatest.invalid",
            'sales_email': f"ventas_{i:03d}@fornexatest.invalid",
            'created_at': timelines[i]['master_created'],
            'updated_at': timelines[i]['master_updated']
        } for i in range(150)
    ]

    # 24. customer_blocks
    dataset['customer_blocks'] = [
        {
            'id': gen_uuid('customer_blocks', i),
            'tenant_id': TENANT_ID,
            'party_id': gen_uuid('parties', i),
            'block_type': 'OPERATIONAL',
            'behavior': 'WARNING',
            'reason': f"[PRUEBA] Revisión documental periódica {i:03d}",
            'blocked_by': None,
            'blocked_at': timelines[i]['master_created'],
            'released_by': None,
            'released_at': None,
            'release_reason': None
        } for i in range(150)
    ]

    # 25. carrier_profiles
    dataset['carrier_profiles'] = [
        {
            'party_id': gen_uuid('parties', i),
            'tenant_id': TENANT_ID,
            'carrier_code': f"CRR-PRV-{i:04d}",
            'transport_licence_number': f"MDPE-ES-{i:05d}",
            'insurance_policy_number': f"POL-TEST-{i:05d}",
            'insurance_carrier_name': 'Seguros Ficticios S.A.',
            'insurance_coverage_amount': 300000.0,
            'insurance_expiry_date': '2027-12-31',
            'adr_certified': False,
            'qualification_status': 'APPROVED',
            'qualification_notes': 'Transportista homologado en entorno de pruebas',
            'created_at': timelines[i]['master_created'],
            'updated_at': timelines[i]['master_updated']
        } for i in range(150)
    ]

    # 26. fuel_index_values
    dataset['fuel_index_values'] = [
        {
            'id': gen_uuid('fuel_index_values', i),
            'tenant_id': TENANT_ID,
            'fuel_index_id': gen_uuid('fuel_indices', i),
            'period_start': '2026-10-01',
            'period_end': '2026-10-31',
            'observed_value': 1.452,
            'created_at': timelines[i]['master_created']
        } for i in range(150)
    ]

    # 27. fuel_index_bands
    dataset['fuel_index_bands'] = [
        {
            'id': gen_uuid('fuel_index_bands', i),
            'tenant_id': TENANT_ID,
            'fuel_index_id': gen_uuid('fuel_indices', i),
            'value_from': 1.40,
            'value_to': 1.50,
            'surcharge_percent': 3.5,
            'surcharge_amount': None,
            'valid_from': '2026-01-01',
            'valid_to': None,
            'created_at': timelines[i]['master_created']
        } for i in range(150)
    ]

    # 28. product_packagings
    dataset['product_packagings'] = [
        {
            'id': gen_uuid('product_packagings', i),
            'tenant_id': TENANT_ID,
            'product_id': gen_uuid('products', i),
            'pack_code': f"BOX-PRV-{i:04d}",
            'pack_type': 'MASTER_CARTON',
            'barcode': gen_gs1_13(i, '8412345'),
            'units_per_pack': 24.0,
            'parent_pack_id': None,
            'gross_weight_kg': 15.0,
            'length_cm': 60.0,
            'width_cm': 40.0,
            'height_cm': 30.0,
            'volume_m3': 0.072,
            'ti_boxes_per_layer': 4,
            'hi_layers': 5,
            'is_stackable': True,
            'is_active': True,
            'created_at': timelines[i]['master_created'],
            'updated_at': timelines[i]['master_updated']
        } for i in range(150)
    ]

    # 29. warehouses
    dataset['warehouses'] = [
        {
            'id': gen_uuid('warehouses', i),
            'tenant_id': TENANT_ID,
            'code': f"WH-PRV-{i:04d}",
            'name': f"[PRUEBA] Plataforma Logística Central {i:03d}",
            'owner_party_id': gen_uuid('parties', i),
            'address_id': gen_uuid('party_addresses', i),
            'status': 'ACTIVE',
            'capabilities': {'cross_dock': True, 'rack_storage': True},
            'created_at': timelines[i]['master_created'],
            'updated_at': timelines[i]['master_updated']
        } for i in range(150)
    ]

    # --- LAYER 3: Operations & Catalog Dependents (11 tables) ---

    # 30. warehouse_zones
    dataset['warehouse_zones'] = [
        {
            'id': gen_uuid('warehouse_zones', i),
            'tenant_id': TENANT_ID,
            'warehouse_id': gen_uuid('warehouses', i),
            'zone_code': f"ZN-{i:03d}",
            'zone_name': f"[PRUEBA] Zona Almacenamiento {i:03d}",
            'zone_type': 'STORAGE',
            'temperature_regime': 'AMBIENT',
            'is_active': True,
            'created_at': timelines[i]['master_created'],
            'updated_at': timelines[i]['master_updated']
        } for i in range(150)
    ]

    # 31. companies
    dataset['companies'] = [
        {
            'id': gen_uuid('companies', i),
            'tenant_id': TENANT_ID,
            'company_code': f"CMP-PRV-{i:04d}",
            'legal_name': f"[PRUEBA] Sociedad Operadora {regions_names[i % len(regions_names)]} {i:03d} S.L.",
            'trade_name': f"Operadora {regions_names[i % len(regions_names)]} {i:03d}",
            'tax_id': f"A99{i:06d}",
            'country_code': 'ES',
            'functional_currency': 'EUR',
            'fiscal_address_id': gen_uuid('party_addresses', i),
            'timezone': 'Europe/Madrid',
            'status': 'ACTIVE',
            'metadata': {'batch': BATCH_ID, 'index': i},
            'created_at': timelines[i]['master_created'],
            'updated_at': timelines[i]['master_updated']
        } for i in range(150)
    ]

    # 32. party_roles
    dataset['party_roles'] = [
        {
            'id': gen_uuid('party_roles', i),
            'tenant_id': TENANT_ID,
            'party_id': gen_uuid('parties', i),
            'company_id': gen_uuid('companies', i),
            'role_code': 'CUSTOMER' if i < 100 else 'CARRIER',
            'valid_from': '2026-01-01',
            'valid_to': None,
            'status': 'ACTIVE',
            'metadata': {'batch': BATCH_ID, 'index': i},
            'created_at': timelines[i]['master_created'],
            'updated_at': timelines[i]['master_updated']
        } for i in range(150)
    ]

    # 33. party_services
    dataset['party_services'] = [
        {
            'id': gen_uuid('party_services', i),
            'tenant_id': TENANT_ID,
            'party_id': gen_uuid('parties', i),
            'service_id': gen_uuid('service_catalog', i),
            'relationship_type': 'OFFERED',
            'reference': f"SRV-REF-{i:04d}",
            'price': 150.0,
            'currency': 'EUR',
            'valid_from': '2026-01-01',
            'valid_to': None,
            'conditions': {'batch': BATCH_ID, 'lead_time_days': 1},
            'is_active': True,
            'created_at': timelines[i]['master_created'],
            'updated_at': timelines[i]['master_updated']
        } for i in range(150)
    ]

    # 34. address_operational_profiles
    dataset['address_operational_profiles'] = [
        {
            'address_id': gen_uuid('party_addresses', i),
            'tenant_id': TENANT_ID,
            'has_dock': True,
            'needs_forklift': False,
            'requires_appointment': True,
            'pallet_exchange': True,
            'adr_capable': False,
            'temperature_controlled': False,
            'temperature_min': None,
            'temperature_max': None,
            'geofence_radius_m': 150,
            'opening_hours': {'mon_fri': '08:00-18:00'},
            'holiday_exceptions': [],
            'average_wait_minutes': 25,
            'access_instructions': 'Entrada por muelle secundario',
            'account_manager_user_id': None,
            'created_at': timelines[i]['master_created'],
            'updated_at': timelines[i]['master_updated']
        } for i in range(150)
    ]

    # 35. party_address_assignments
    dataset['party_address_assignments'] = [
        {
            'id': gen_uuid('party_address_assignments', i),
            'tenant_id': TENANT_ID,
            'address_id': gen_uuid('party_addresses', i),
            'party_id': gen_uuid('parties', i),
            'use_for_pickup': True,
            'use_for_delivery': True,
            'is_default_pickup': True,
            'is_default_delivery': True,
            'created_by': None,
            'created_at': timelines[i]['master_created'],
            'updated_at': timelines[i]['master_updated']
        } for i in range(150)
    ]

    # 36. warehouse_bins
    dataset['warehouse_bins'] = [
        {
            'id': gen_uuid('warehouse_bins', i),
            'tenant_id': TENANT_ID,
            'warehouse_id': gen_uuid('warehouses', i),
            'zone_id': gen_uuid('warehouse_zones', i),
            'bin_code': f"BIN-{i:03d}-A1",
            'aisle': 'A',
            'rack': '1',
            'shelf': '1',
            'bin_position': '1',
            'bin_type': 'PALLET_RACK',
            'max_weight_kg': 1000.0,
            'max_volume_m3': 2.5,
            'max_pallets': 2,
            'is_blocked': False,
            'block_reason': None,
            'is_active': True,
            'created_at': timelines[i]['master_created'],
            'updated_at': timelines[i]['master_updated']
        } for i in range(150)
    ]

    # 37. tariff_lines
    dataset['tariff_lines'] = [
        {
            'id': gen_uuid('tariff_lines', i),
            'tenant_id': TENANT_ID,
            'tariff_header_id': gen_uuid('tariff_headers', i),
            'pricing_unit': 'SHIPMENT',
            'from_quantity': 1.0,
            'to_quantity': None,
            'unit_price': 150.0,
            'minimum_amount': 50.0,
            'adr_surcharge': None,
            'liftgate_surcharge': None,
            'waiting_time_rate': None,
            'customs_fee': None,
            'fuel_surcharge_formula': None,
            'discount_percent': None,
            'created_at': timelines[i]['master_created'],
            'component': 'BASE_FREIGHT'
        } for i in range(150)
    ]

    # 38. tariff_assignments
    dataset['tariff_assignments'] = [
        {
            'id': gen_uuid('tariff_assignments', i),
            'tenant_id': TENANT_ID,
            'tariff_header_id': gen_uuid('tariff_headers', i),
            'party_id': gen_uuid('parties', i),
            'created_by': None,
            'created_at': timelines[i]['master_created']
        } for i in range(150)
    ]

    # 39. tariff_rules
    dataset['tariff_rules'] = [
        {
            'id': gen_uuid('tariff_rules', i),
            'tenant_id': TENANT_ID,
            'tariff_header_id': gen_uuid('tariff_headers', i),
            'rule_type': 'FIXED_PER_SHIPMENT',
            'component': 'SURCHARGE',
            'params': {'amount': 15.0},
            'params_schema_version': 1,
            'applies_to_zone_id': None,
            'valid_from': '2026-01-01',
            'valid_to': None,
            'priority': 1,
            'is_active': True,
            'created_at': timelines[i]['master_created'],
            'updated_at': timelines[i]['master_updated']
        } for i in range(150)
    ]

    # 40. transit_times
    dataset['transit_times'] = [
        {
            'id': gen_uuid('transit_times', i),
            'tenant_id': TENANT_ID,
            'party_id': gen_uuid('parties', i),
            'service_id': gen_uuid('service_catalog', i),
            'origin_zone_id': gen_uuid('tariff_zones', i),
            'destination_zone_id': gen_uuid('tariff_zones', (i + 1) % 150),
            'transit_mode': 'BUSINESS_DAYS',
            'planned_duration_minutes': None,
            'business_days': 1,
            'valid_from': '2026-01-01',
            'valid_to': None,
            'priority': 1,
            'created_at': timelines[i]['master_created'],
            'updated_at': timelines[i]['master_updated']
        } for i in range(150)
    ]

    # --- LAYER 4: Commercial & Order Flow (14 tables) ---

    # 41. external_service_mappings
    dataset['external_service_mappings'] = [
        {
            'id': gen_uuid('external_service_mappings', i),
            'tenant_id': TENANT_ID,
            'party_id': gen_uuid('parties', i),
            'internal_service_id': gen_uuid('service_catalog', i),
            'external_code': f"EXT-SRV-{i:04d}",
            'external_name': f"External Service {i:04d}",
            'legacy_name': None,
            'valid_from': '2026-01-01',
            'valid_to': None,
            'metadata': {'batch': BATCH_ID, 'index': i},
            'created_at': timelines[i]['master_created'],
            'updated_at': timelines[i]['master_updated']
        } for i in range(150)
    ]

    # 42. pricing_runs
    dataset['pricing_runs'] = [
        {
            'id': gen_uuid('pricing_runs', i),
            'tenant_id': TENANT_ID,
            'kind': 'SELL',
            'tariff_header_id': gen_uuid('tariff_headers', i),
            'tariff_header_version': 1,
            'billable_quantity': 1.0,
            'billable_unit': 'SHIPMENT',
            'pickup_amount': 25.0,
            'linehaul_amount': 100.0,
            'delivery_amount': 25.0,
            'surcharge_amount': 0.0,
            'currency': 'EUR',
            'total': 150.0,
            'input': {'weight': 500, 'packages': 1},
            'trace': {'rules_applied': 1},
            'breakdown': {'base': 150.0},
            'engine_version': '1.0.0',
            'created_at': timelines[i]['master_created']
        } for i in range(150)
    ]

    # 43. offers
    dataset['offers'] = [
        {
            'id': gen_uuid('offers', i),
            'tenant_id': TENANT_ID,
            'code': f"OFF-PRV-{i:04d}",
            'customer_id': gen_uuid('parties', i % 100),
            'service_id': gen_uuid('service_catalog', i),
            'status': 'ACCEPTED',
            'currency': 'EUR',
            'subtotal': 150.0,
            'taxes': 31.5,
            'total': 181.5,
            'valid_until': '2026-12-31',
            'conditions': 'Condiciones estándar de transporte FTL',
            'metadata': {'batch': BATCH_ID, 'index': i},
            'created_at': timelines[i]['master_created'],
            'updated_at': timelines[i]['master_updated'],
            'pricing_snapshot': {'total': 181.5},
            'cost_pricing_run_id': None,
            'sell_pricing_run_id': gen_uuid('pricing_runs', i),
            'margin_amount': 30.0,
            'margin_percent': 20.0,
            'result': 'WON'
        } for i in range(150)
    ]

    # 44. orders
    dataset['orders'] = [
        {
            'id': gen_uuid('orders', i),
            'tenant_id': TENANT_ID,
            'code': f"ORD-PRV-{i:04d}",
            'customer_id': gen_uuid('parties', i % 100),
            'customer_reference': f"PO-REF-{i:05d}",
            'service_id': gen_uuid('service_catalog', i),
            'pickup_address_id': gen_uuid('party_addresses', i),
            'delivery_address_id': gen_uuid('party_addresses', (i + 1) % 150),
            'requested_pickup_start': timelines[i]['pickup_start'],
            'requested_pickup_end': timelines[i]['pickup_end'],
            'requested_delivery_start': timelines[i]['delivery_start'],
            'requested_delivery_end': timelines[i]['delivery_end'],
            'packages': 5,
            'gross_weight': 250.0,
            'volume': 1.2,
            'linear_meters': 0.8,
            'goods_description': f"[PRUEBA] Paquetería Industrial {i:03d}",
            'adr': {'is_adr': False},
            'status': 'COMPLETED',
            'metadata': {'batch': BATCH_ID, 'index': i},
            'created_at': timelines[i]['order_created'],
            'updated_at': timelines[i]['order_updated'],
            'hazmat_declaration': 'NO',
            'hazmat_edition_id': None,
            'hazmat_validation_status': 'NOT_EVALUATED',
            'revision_number': 1,
            'business_id': gen_uuid('companies', i),
            'supersedes_order_id': None,
            'launched_at': timelines[i]['order_created'],
            'revoked_at': None,
            'pricing_snapshot': {'total': 181.5}
        } for i in range(150)
    ]

    # 45. offer_lines
    dataset['offer_lines'] = [
        {
            'id': gen_uuid('offer_lines', i),
            'tenant_id': TENANT_ID,
            'offer_id': gen_uuid('offers', i),
            'line_number': 1,
            'description': f"[PRUEBA] Porte en Carga Completa {i:03d}",
            'quantity': 1.0,
            'unit_price': 150.0,
            'total': 150.0,
            'metadata': {'batch': BATCH_ID, 'index': i},
            'override_reason': None,
            'overridden_by': None
        } for i in range(150)
    ]

    # 46. order_lines
    dataset['order_lines'] = [
        {
            'id': gen_uuid('order_lines', i),
            'tenant_id': TENANT_ID,
            'order_id': gen_uuid('orders', i),
            'product_id': gen_uuid('products', i),
            'line_number': 1,
            'description': f"[PRUEBA] Mercancía Paletizada {i:03d}",
            'sku': f"SKU-PRV-{i:05d}",
            'packages': 5,
            'gross_weight': 250.0,
            'volume': 1.2,
            'hazard_status': 'NON_HAZARDOUS',
            'adr': {'is_adr': False},
            'metadata': {'batch': BATCH_ID, 'index': i},
            'created_at': timelines[i]['order_created']
        } for i in range(150)
    ]

    # 47. delivery_notes
    dataset['delivery_notes'] = [
        {
            'id': gen_uuid('delivery_notes', i),
            'tenant_id': TENANT_ID,
            'order_id': gen_uuid('orders', i),
            'code': f"ALB-PRV-{i:04d}",
            'pickup_address_id': gen_uuid('party_addresses', i),
            'delivery_address_id': gen_uuid('party_addresses', (i + 1) % 150),
            'pickup_window_start': None,
            'pickup_window_end': None,
            'delivery_window_start': None,
            'delivery_window_end': None,
            'goods_description': f"[PRUEBA] Albarán Entrega {i:03d}",
            'packages': 5,
            'gross_weight': 250.0,
            'volume': 1.2,
            'status': 'DELIVERED',
            'metadata': {'batch': BATCH_ID, 'index': i},
            'created_at': timelines[i]['expedition_created'],
            'updated_at': timelines[i]['expedition_updated'],
            'external_reference': f"EXT-ALB-{i:05d}"
        } for i in range(150)
    ]

    # 48. expeditions
    dataset['expeditions'] = [
        {
            'id': gen_uuid('expeditions', i),
            'tenant_id': TENANT_ID,
            'order_id': gen_uuid('orders', i),
            'service_id': gen_uuid('service_catalog', i),
            'carrier_id': gen_uuid('parties', (i % 30) + 120),
            'code': f"EXP-PRV-{i:04d}",
            'origin_address_id': gen_uuid('party_addresses', i),
            'destination_address_id': gen_uuid('party_addresses', (i + 1) % 150),
            'planned_departure': timelines[i]['trip_planned_start'],
            'planned_arrival': timelines[i]['trip_planned_end'],
            'status': 'DELIVERED',
            'metadata': {'batch': BATCH_ID, 'index': i},
            'created_at': timelines[i]['expedition_created'],
            'updated_at': timelines[i]['expedition_updated']
        } for i in range(150)
    ]

    # 49. order_hazmat_assessments
    dataset['order_hazmat_assessments'] = [
        {
            'id': gen_uuid('order_hazmat_assessments', i),
            'tenant_id': TENANT_ID,
            'order_id': gen_uuid('orders', i),
            'edition_id': None,
            'status': 'VALIDATED',
            'category_totals': {'exempt': True},
            'points_total': 0.0,
            'warnings': [],
            'input_hash': f"hash_ord_{i:04d}",
            'assessed_at': timelines[i]['order_updated'],
            'assessed_by': None
        } for i in range(150)
    ]

    # 50. inventory_quants
    dataset['inventory_quants'] = [
        {
            'id': gen_uuid('inventory_quants', i),
            'tenant_id': TENANT_ID,
            'warehouse_id': gen_uuid('warehouses', i),
            'bin_id': gen_uuid('warehouse_bins', i),
            'product_id': gen_uuid('products', i),
            'owner_party_id': gen_uuid('parties', i % 100),
            'batch_number': f"LOT-2026-{i:04d}",
            'serial_number': None,
            'expiry_date': '2027-12-31',
            'quantity_on_hand': 100.0,
            'quantity_reserved': 0.0,
            'uom': 'UN',
            'stock_status': 'AVAILABLE',
            'last_counted_at': timelines[i]['master_created'],
            'created_at': timelines[i]['master_created'],
            'updated_at': timelines[i]['master_updated']
        } for i in range(150)
    ]

    # 51. pricing_run_components
    dataset['pricing_run_components'] = [
        {
            'id': gen_uuid('pricing_run_components', i),
            'tenant_id': TENANT_ID,
            'pricing_run_id': gen_uuid('pricing_runs', i),
            'sequence': 1,
            'component': 'BASE_FREIGHT',
            'description': 'Porte base por envío completo',
            'source_rule_id': None,
            'quantity': 1.0,
            'unit': 'SHIPMENT',
            'rate': 150.0,
            'amount': 150.0,
            'metadata': {'batch': BATCH_ID, 'index': i},
            'created_at': timelines[i]['order_created']
        } for i in range(150)
    ]

    # 52. delivery_note_lines
    dataset['delivery_note_lines'] = [
        {
            'id': gen_uuid('delivery_note_lines', i),
            'tenant_id': TENANT_ID,
            'delivery_note_id': gen_uuid('delivery_notes', i),
            'order_line_id': gen_uuid('order_lines', i),
            'line_number': 1,
            'description': f"[PRUEBA] Mercancía Industrial Ref {i:03d}",
            'packages': 5,
            'gross_weight': 250.0,
            'metadata': {'batch': BATCH_ID, 'index': i},
            'created_at': timelines[i]['expedition_created']
        } for i in range(150)
    ]

    # 53. expedition_delivery_notes
    dataset['expedition_delivery_notes'] = [
        {
            'id': gen_uuid('expedition_delivery_notes', i),
            'tenant_id': TENANT_ID,
            'expedition_id': gen_uuid('expeditions', i),
            'delivery_note_id': gen_uuid('delivery_notes', i),
            'created_at': timelines[i]['expedition_created']
        } for i in range(150)
    ]

    # 54. inventory_movements
    dataset['inventory_movements'] = [
        {
            'id': gen_uuid('inventory_movements', i),
            'tenant_id': TENANT_ID,
            'movement_number': f"MOV-PRV-{i:04d}",
            'warehouse_id': gen_uuid('warehouses', i),
            'movement_type': 'RECEIPT',
            'product_id': gen_uuid('products', i),
            'source_bin_id': None,
            'destination_bin_id': gen_uuid('warehouse_bins', i),
            'quantity': 100.0,
            'uom': 'UN',
            'owner_party_id': gen_uuid('parties', i % 100),
            'batch_number': f"LOT-2026-{i:04d}",
            'serial_number': None,
            'reference_order_id': gen_uuid('orders', i),
            'reference_delivery_note_id': gen_uuid('delivery_notes', i),
            'operator_id': 'DATA150_OPERATOR',
            'requested_at': timelines[i]['movement_requested'],
            'started_at': timelines[i]['movement_started'],
            'completed_at': timelines[i]['movement_completed'],
            'duration_seconds': 120,
            'status': 'COMPLETED',
            'notes': f"Movimiento de recepción de prueba {i:03d}",
            'created_at': timelines[i]['movement_completed'],
            'updated_at': timelines[i]['movement_completed']
        } for i in range(150)
    ]

    # --- LAYER 5: Transport, Execution & CMR (14 tables) ---

    # 55. trips
    dataset['trips'] = [
        {
            'id': gen_uuid('trips', i),
            'tenant_id': TENANT_ID,
            'code': f"VIA-PRV-{i:04d}",
            'carrier_id': gen_uuid('parties', (i % 30) + 120),
            'vehicle_id': gen_uuid('vehicles', i),
            'trailer_registration': f"99{i:02d}RRR",
            'driver_id': gen_uuid('drivers', i),
            'planned_start': timelines[i]['trip_planned_start'],
            'actual_start': timelines[i]['trip_actual_start'],
            'planned_end': timelines[i]['trip_planned_end'],
            'actual_end': timelines[i]['trip_actual_end'],
            'status': 'COMPLETED',
            'metadata': {'batch': BATCH_ID, 'index': i},
            'created_at': timelines[i]['trip_created'],
            'updated_at': timelines[i]['trip_updated']
        } for i in range(150)
    ]

    # 56. trip_expeditions
    dataset['trip_expeditions'] = [
        {
            'id': gen_uuid('trip_expeditions', i),
            'tenant_id': TENANT_ID,
            'trip_id': gen_uuid('trips', i),
            'expedition_id': gen_uuid('expeditions', i),
            'sequence': 1,
            'created_at': timelines[i]['trip_created']
        } for i in range(150)
    ]

    # 57. trip_stops
    dataset['trip_stops'] = [
        {
            'id': gen_uuid('trip_stops', i),
            'tenant_id': TENANT_ID,
            'trip_id': gen_uuid('trips', i),
            'sequence': 1,
            'stop_type': 'PICKUP',
            'address_id': gen_uuid('party_addresses', i),
            'company_name': f"[PRUEBA] Cargador {i:03d}",
            'full_address': f"{unique_addresses[i]['address_line1']}, {unique_addresses[i]['city']}",
            'latitude': unique_addresses[i]['latitude'],
            'longitude': unique_addresses[i]['longitude'],
            'window_start': None,
            'window_end': None,
            'contact_name': f"Jefe Muelle {i:03d}",
            'contact_phone': None,
            'operational_reference': f"STOP-REF-{i:04d}",
            'status': 'COMPLETED',
            'arrived_at': timelines[i]['stop_arrived'],
            'completed_at': timelines[i]['stop_completed'],
            'metadata': {'batch': BATCH_ID, 'index': i},
            'created_at': timelines[i]['trip_created'],
            'updated_at': timelines[i]['stop_completed']
        } for i in range(150)
    ]

    # 58. trip_stop_delivery_notes
    dataset['trip_stop_delivery_notes'] = [
        {
            'id': gen_uuid('trip_stop_delivery_notes', i),
            'tenant_id': TENANT_ID,
            'trip_stop_id': gen_uuid('trip_stops', i),
            'delivery_note_id': gen_uuid('delivery_notes', i),
            'operation': 'PICKUP',
            'created_at': timelines[i]['trip_created']
        } for i in range(150)
    ]

    # 59. trip_hazmat_assessments
    dataset['trip_hazmat_assessments'] = [
        {
            'id': gen_uuid('trip_hazmat_assessments', i),
            'tenant_id': TENANT_ID,
            'trip_id': gen_uuid('trips', i),
            'trip_stop_id': gen_uuid('trip_stops', i),
            'edition_id': None,
            'sequence': 1,
            'category_totals': {'exempt': True},
            'points_total': 0.0,
            'warnings': [],
            'input_hash': f"hash_trip_{i:04d}",
            'assessed_at': timelines[i]['trip_created']
        } for i in range(150)
    ]

    # 60. cmr_documents
    dataset['cmr_documents'] = [
        {
            'id': gen_uuid('cmr_documents', i),
            'cmr_number': f"DATA150-CMR-{i:05d}",
            'access_key': f"CMRKEY{i:04d}SECUREX99",
            'status': 'Borrador',
            'source': 'DATA150_BATCH',
            'expedition_id': str(gen_uuid('expeditions', i)),
            'trip_id': str(gen_uuid('trips', i)),
            'customer_ids': [gen_uuid('parties', i % 100)],
            'sender': f"[PRUEBA] Remitente {i:03d}",
            'recipient': f"[PRUEBA] Destinatario {i:03d}",
            'pickup_location': f"{unique_addresses[i]['city']}",
            'delivery_location': f"{unique_addresses[(i + 1) % 150]['city']}",
            'carrier': f"[PRUEBA] Transportista {i:03d}",
            'vehicle_registration': f"99{i:02d}XYZ",
            'trailer_registration': f"99{i:02d}RRR",
            'goods_description': f"[PRUEBA] Mercancía Industrial {i:03d}",
            'packages': 5,
            'packaging': 'Palet',
            'gross_weight': 250.0,
            'volume': 1.2,
            'instructions': 'Manipulación estándar',
            'adr': {'is_adr': False},
            'metadata': {'batch': BATCH_ID, 'index': i},
            'issued_at': timelines[i]['cmr_issued'],
            'created_at': timelines[i]['cmr_created'],
            'updated_at': timelines[i]['cmr_updated'],
            'tenant_id': TENANT_ID,
            'expedition_record_id': gen_uuid('expeditions', i),
            'trip_record_id': gen_uuid('trips', i),
            'sender_party_id': gen_uuid('parties', i),
            'recipient_party_id': gen_uuid('parties', (i + 1) % 150),
            'carrier_party_id': gen_uuid('parties', (i % 30) + 120),
            'external_document_number': f"DOC-{i:05d}",
            'sender_instructions': 'Sin incidencias',
            'carrier_reservations': None,
            'particular_terms': None,
            'carriage_charges': {'prepaid': True},
            'cash_on_delivery': {'has_cod': False},
            'established_at': 'Madrid',
            'established_on': timelines[i]['order_created'][:10],
            'access_key_expires_at': None,
            'access_key_revoked_at': None,
            'document_kind': 'cmr',
            'regulatory_scope': 'cmr_convention'
        } for i in range(150)
    ]

    # 61. transport_stops
    dataset['transport_stops'] = [
        {
            'id': gen_uuid('transport_stops', i),
            'cmr_id': gen_uuid('cmr_documents', i),
            'sequence': 1,
            'stop_type': 'Recogida',
            'company': f"[PRUEBA] Cargador {i:03d}",
            'address': f"{unique_addresses[i]['address_line1']}, {unique_addresses[i]['city']}",
            'window_start': None,
            'window_end': None,
            'contact_phone': None,
            'latitude': unique_addresses[i]['latitude'],
            'longitude': unique_addresses[i]['longitude'],
            'status': 'Completada',
            'arrived_at': timelines[i]['stop_arrived'],
            'completed_at': timelines[i]['stop_completed'],
            'created_at': timelines[i]['trip_created'],
            'tenant_id': TENANT_ID,
            'trip_stop_id': gen_uuid('trip_stops', i),
            'address_id': gen_uuid('party_addresses', i),
            'contact_name': f"Contacto {i:03d}",
            'operational_reference': f"STOP-CMR-{i:04d}"
        } for i in range(150)
    ]

    # 62. cmr_clauses
    dataset['cmr_clauses'] = [
        {
            'id': gen_uuid('cmr_clauses', i),
            'cmr_id': gen_uuid('cmr_documents', i),
            'clause_type': 'particular_term',
            'sequence': 1,
            'text_value': f"[PRUEBA] Cláusula de transporte ficticia {i:03d}",
            'source': 'TEMPLATE',
            'metadata': {'batch': BATCH_ID, 'index': i},
            'created_at': timelines[i]['cmr_created']
        } for i in range(150)
    ]

    # 63. cmr_attachments
    dataset['cmr_attachments'] = [
        {
            'id': gen_uuid('cmr_attachments', i),
            'cmr_id': gen_uuid('cmr_documents', i),
            'sequence': 1,
            'document_type': 'ALBARAN',
            'title': f"[PRUEBA] Albarán {i:03d}",
            'storage_path': f"mock/attachments/alb_{i:04d}.pdf",
            'external_reference': f"ATT-{i:05d}",
            'metadata': {'batch': BATCH_ID, 'index': i},
            'created_at': timelines[i]['cmr_created']
        } for i in range(150)
    ]

    # 64. cmr_parties
    dataset['cmr_parties'] = [
        {
            'id': gen_uuid('cmr_parties', i),
            'cmr_id': gen_uuid('cmr_documents', i),
            'role': 'sender',
            'sequence': 1,
            'customer_id': str(gen_uuid('parties', i % 100)),
            'legal_name': f"[PRUEBA] Empresa Remitente {i:03d} S.L.",
            'tax_id': f"B99{i:06d}",
            'address': unique_addresses[i]['address_line1'],
            'postal_code': unique_addresses[i]['postal_code'],
            'city': unique_addresses[i]['city'],
            'country_code': 'ES',
            'contact_name': f"Responsable {i:03d}",
            'contact_phone': None,
            'metadata': {'batch': BATCH_ID, 'index': i},
            'created_at': timelines[i]['cmr_created']
        } for i in range(150)
    ]

    # 65. cmr_goods_lines
    dataset['cmr_goods_lines'] = [
        {
            'id': gen_uuid('cmr_goods_lines', i),
            'cmr_id': gen_uuid('cmr_documents', i),
            'sequence': 1,
            'marks_numbers': f"MN-{i:04d}",
            'packages': 5,
            'packaging_code': 'PX',
            'packaging_description': 'Palet',
            'goods_description': f"[PRUEBA] Mercancía Industrial Ref {i:03d}",
            'statistical_number': '84713000',
            'gross_weight': 250.0,
            'volume': 1.2,
            'adr_declared': False,
            'un_number': None,
            'adr_class': None,
            'labels': None,
            'packing_group': None,
            'tunnel_code': None,
            'adr_description': None,
            'metadata': {'batch': BATCH_ID, 'index': i},
            'created_at': timelines[i]['cmr_created'],
            'source_order_line_id': gen_uuid('order_lines', i),
            'hazmat_snapshot': {'is_adr': False},
            'hazmat_edition_code': None,
            'hazmat_input_hash': None
        } for i in range(150)
    ]

    # 66. cmr_expeditions (composite PK: cmr_id, expedition_id)
    dataset['cmr_expeditions'] = [
        {
            'cmr_id': gen_uuid('cmr_documents', i),
            'expedition_id': gen_uuid('expeditions', i),
            'sequence': 1,
            'metadata': {'batch': BATCH_ID, 'index': i},
            'created_at': timelines[i]['cmr_created']
        } for i in range(150)
    ]

    # 67. transport_events
    dataset['transport_events'] = [
        {
            'id': gen_uuid('transport_events', i),
            'cmr_id': gen_uuid('cmr_documents', i),
            'stop_id': gen_uuid('transport_stops', i),
            'event_type': event_types[i % len(event_types)],
            'occurred_at': timelines[i]['event_occurred'],
            'latitude': unique_addresses[i]['latitude'],
            'longitude': unique_addresses[i]['longitude'],
            'payload': {'batch': BATCH_ID, 'event': event_types[i % len(event_types)].upper(), 'milestone_index': i},
            'idempotency_key': f"EVT-IDEMP-{i:05d}",
            'created_at': timelines[i]['event_created'],
            'tenant_id': TENANT_ID,
            'actor_user_id': None
        } for i in range(150)
    ]

    # 68. cmr_signatures
    cmr_sig_roles = ['sender', 'carrier', 'consignee']
    cmr_sig_role_labels = ['Remitente', 'Transportista', 'Destinatario']
    dataset['cmr_signatures'] = [
        {
            'id': gen_uuid('cmr_signatures', i),
            'cmr_id': gen_uuid('cmr_documents', i),
            'stop_id': gen_uuid('transport_stops', i),
            'role': cmr_sig_roles[i % 3],
            'signer_name': f"[PRUEBA] Firmante {cmr_sig_role_labels[i % 3]} {i:03d}",
            'signer_document': f"TEST-DNI-{i:05d}X",
            'company_name': f"[PRUEBA] Sociedad Logística {i:03d} SL",
            'signature_storage_path': f"mock-signatures/cmr_{i:04d}_sig_{i}.png",
            'stamp_storage_path': f"mock-stamps/cmr_{i:04d}_stamp_{i}.png",
            'signature_method': 'electronic',
            'signed_at': timelines[i]['stop_completed'],
            'latitude': unique_addresses[i]['latitude'],
            'longitude': unique_addresses[i]['longitude'],
            'device_id': f"mock-device-{i:04d}",
            'metadata': {'batch': BATCH_ID, 'synthetic': True, 'test_flow': 'DATA150-MOCK-SIGNATURE', 'index': i},
            'created_at': timelines[i]['stop_completed']
        } for i in range(150)
    ]

    # 69. transport_evidence
    evidence_dir = Path('scripts/data150/artifacts/evidence')
    evidence_dir.mkdir(parents=True, exist_ok=True)
    evidence_rows = []
    for i in range(150):
        ev_id = gen_uuid('transport_evidence', i)
        cmr_id = gen_uuid('cmr_documents', i)
        stop_id = gen_uuid('transport_stops', i)
        event_id = gen_uuid('transport_events', i)
        storage_path = f"{TENANT_ID}/{cmr_id}/{stop_id}/DATA150-MOCK-EVIDENCE-{i:04d}.jpg"
        jpg_file = evidence_dir / f"pod_{i:04d}.jpg"
        with open(jpg_file, 'wb') as f:
            f.write(SYNTHETIC_JPEG_BYTES)

        evidence_rows.append({
            'id': ev_id,
            'cmr_id': cmr_id,
            'stop_id': stop_id,
            'event_id': event_id,
            'kind': 'pod_photo',
            'storage_path': storage_path,
            'captured_at': timelines[i]['event_occurred'],
            'metadata': {
                'batch': BATCH_ID,
                'synthetic': True,
                'test_flow': 'DATA150-MOCK-EVIDENCE',
                'index': i,
                'fileName': f"pod_{i:04d}.jpg",
                'size': len(SYNTHETIC_JPEG_BYTES),
                'sha256': hashlib.sha256(SYNTHETIC_JPEG_BYTES).hexdigest()
            },
            'created_at': timelines[i]['event_created'],
            'tenant_id': TENANT_ID
        })
    dataset['transport_evidence'] = evidence_rows

    # 70. regulatory_document_artifacts
    doc_kinds = ['deca', 'cmr', 'ecmr', 'pod']
    reg_scopes = ['deca_es', 'cmr_convention', 'ecmr_protocol', 'efti']
    artifacts_dir = Path('scripts/data150/artifacts/regulatory')
    artifacts_dir.mkdir(parents=True, exist_ok=True)
    artifacts_rows = []

    for i in range(150):
        art_id = gen_uuid('regulatory_document_artifacts', i)
        cmr_id = gen_uuid('cmr_documents', i)
        kind = doc_kinds[i % 4]
        scope = reg_scopes[i % 4]
        nonce = hashlib.sha256(f"DATA150-REG-NONCE-{i}".encode('utf-8')).hexdigest()[:24]
        storage_path = f"{TENANT_ID}/{cmr_id}/{kind}/{scope}/v1-{nonce}.pdf"
        pdf_bytes = make_synthetic_pdf_bytes(art_id, i, cmr_id, kind, scope)
        sha256_hash = hashlib.sha256(pdf_bytes).hexdigest()
        byte_size = len(pdf_bytes)

        pdf_file = artifacts_dir / f"doc_{i:04d}.pdf"
        with open(pdf_file, 'wb') as f:
            f.write(pdf_bytes)

        artifacts_rows.append({
            'id': art_id,
            'tenant_id': TENANT_ID,
            'cmr_id': cmr_id,
            'document_kind': kind,
            'regulatory_scope': scope,
            'version': 1,
            'mime_type': 'application/pdf',
            'storage_path': storage_path,
            'sha256': sha256_hash,
            'byte_size': byte_size,
            'document_created_at': timelines[i]['cmr_created'],
            'document_modified_at': timelines[i]['cmr_created'],
            'issued_at': timelines[i]['cmr_created'],
            'supersedes_artifact_id': None,
            'metadata': {
                'batch': BATCH_ID,
                'synthetic': True,
                'test_flow': 'DATA150-MOCK-ARTIFACT',
                'index': i,
                'canonical_pair': f"{kind}/{scope}"
            },
            'created_at': timelines[i]['cmr_created']
        })
    dataset['regulatory_document_artifacts'] = artifacts_rows

    return dataset

def sql_val(v, col_meta=None):
    if v is None:
        return 'NULL'
    if col_meta:
        dtype = col_meta.get('data_type')
        if dtype in ('json', 'jsonb'):
            s = json.dumps(v).replace("'", "''")
            return f"'{s}'::jsonb"
        if dtype == 'ARRAY' or (isinstance(dtype, str) and dtype.startswith('_')):
            if isinstance(v, list):
                if len(v) == 0:
                    return "'{}'"
                items = ','.join(f'"{str(item)}"' for item in v)
                return f"'{{{items}}}'"
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, dict):
        s = json.dumps(v).replace("'", "''")
        return f"'{s}'::jsonb"
    if isinstance(v, list):
        s = json.dumps(v).replace("'", "''")
        return f"'{s}'::jsonb"
    s = str(v).replace("'", "''")
    return f"'{s}'"

def generate_sql_loader_and_rollback(dataset, baseline_tables):
    loader_lines = [
        "-- FORNEXA — DATA150 PRODUCTION LOADER: IDEMPOTENT TRANSACTIONAL SYNTHETIC TEST BATCH",
        "-- Batch ID: DATA150-PRODUCTION-20261009",
        f"-- Target Tenant: {TENANT_ID}",
        "-- Total Tables: 70 | Rows per table: 150 | Total rows: 10,500",
        "-- Constraint: Zero invented columns, 150 firmas MOCK sintéticas autorizadas expresamente (Opción B) sin validez legal atribuida, fail-closed",
        "-- Real Return: Statements use RETURNING to capture effectively inserted rows only",
        "-- ==========================================================================\n",
        "BEGIN;\n"
    ]

    rollback_lines = [
        "-- FORNEXA — DATA150 PRODUCTION ROLLBACK: PLANTILLA VINCULADA A PROPIEDAD EFECTIVA",
        "-- ==============================================================================",
        "-- ADVERTENCIA OPERATIVA OBLIGATORIA:",
        "-- Este script es una plantilla de referencia. El procedimiento operativo vinculante",
        "-- exige generar el rollback EXCLUSIVAMENTE a partir del recibo de ejecución efectiva",
        "-- (docs/verification/data150-execution-receipt.json) ejecutando:",
        "--   node --experimental-strip-types scripts/data150/generate_rollback_from_receipt.ts",
        "-- Queda prohibido ejecutar una reversión con claves no acreditadas por RETURNING.",
        f"-- Batch ID: {BATCH_ID} | Tenant: {TENANT_ID}",
        "-- ==============================================================================\n",
        "BEGIN;\n"
    ]

    table_keys_receipt = {}

    # Build loader SQL in forward topological order
    for tname, rows in dataset.items():
        if not rows:
            continue
        col_names = list(rows[0].keys())
        table_meta = baseline_tables[tname]
        col_map = table_meta['columns']
        pks = table_meta['primary_keys']
        cols_str = ', '.join(f'"{c}"' for c in col_names)

        loader_lines.append(f"-- Table {tname} (+150 rows)")

        # Conflict clause with RETURNING
        if pks and len(pks) == 1 and pks[0] in col_names:
            pk_name = pks[0]
            conflict_clause = f'ON CONFLICT ("{pk_name}") DO NOTHING RETURNING "{pk_name}";'
        elif pks and len(pks) > 1 and all(k in col_names for k in pks):
            pk_tuple = ', '.join(f'"{k}"' for k in pks)
            conflict_clause = f'ON CONFLICT ({pk_tuple}) DO NOTHING RETURNING {pk_tuple};'
        else:
            conflict_clause = ';'

        for r in rows:
            if tname == 'operational_events':
                row_vals = ', '.join(sql_val(r.get(c), col_map.get(c)) for c in col_names)
                evt_code = r['entity_code']
                loader_lines.append(
                    f'INSERT INTO public.operational_events ({cols_str}) SELECT {row_vals} '
                    f'WHERE NOT EXISTS (SELECT 1 FROM public.operational_events WHERE tenant_id = \'{TENANT_ID}\' AND entity_code = \'{evt_code}\') '
                    f'RETURNING id, entity_code;'
                )
            elif tname == 'customs_events':
                row_vals = ', '.join(sql_val(r.get(c), col_map.get(c)) for c in col_names)
                case_id = r['case_id']
                evt_type = r['event_type']
                loader_lines.append(
                    f'INSERT INTO public.customs_events ({cols_str}) SELECT {row_vals} '
                    f'WHERE NOT EXISTS (SELECT 1 FROM public.customs_events WHERE tenant_id = \'{TENANT_ID}\' AND case_id = \'{case_id}\' AND event_type = \'{evt_type}\') '
                    f'RETURNING id, case_id;'
                )
            elif tname == 'transport_events':
                vals_list = []
                for c in col_names:
                    if c == 'actor_user_id':
                        vals_list.append(
                            f"(SELECT tm.user_id FROM public.tenant_members tm "
                            f"JOIN auth.users u ON u.id = tm.user_id "
                            f"WHERE tm.tenant_id = '{TENANT_ID}' AND tm.status = 'ACTIVE' AND tm.role IN ('OWNER', 'ADMIN') "
                            f"ORDER BY CASE tm.role WHEN 'OWNER' THEN 1 WHEN 'ADMIN' THEN 2 ELSE 3 END, tm.created_at ASC LIMIT 1)"
                        )
                    else:
                        vals_list.append(sql_val(r.get(c), col_map.get(c)))
                row_vals = ', '.join(vals_list)
                loader_lines.append(f'INSERT INTO public.{tname} ({cols_str}) VALUES ({row_vals}) {conflict_clause}')
            else:
                row_vals = ', '.join(sql_val(r.get(c), col_map.get(c)) for c in col_names)
                loader_lines.append(f'INSERT INTO public.{tname} ({cols_str}) VALUES ({row_vals}) {conflict_clause}')
        loader_lines.append('')

        # Collect PKs for receipt and rollback
        if len(pks) == 1:
            pk_col = pks[0]
            if pk_col in rows[0]:
                keys = [r[pk_col] for r in rows if r[pk_col] is not None]
                table_keys_receipt[tname] = {'pk_type': 'single', 'pk_col': pk_col, 'keys': keys}
            else:
                if tname == 'operational_events':
                    table_keys_receipt[tname] = {
                        'pk_type': 'identity',
                        'pk_col': pk_col,
                        'correlation_col': 'entity_code',
                        'correlation_keys': [r['entity_code'] for r in rows],
                        'keys': []
                    }
                elif tname == 'customs_events':
                    table_keys_receipt[tname] = {
                        'pk_type': 'identity',
                        'pk_col': pk_col,
                        'correlation_col': 'case_id',
                        'correlation_keys': [r['case_id'] for r in rows],
                        'keys': []
                    }
                else:
                    table_keys_receipt[tname] = {'pk_type': 'identity', 'pk_col': pk_col, 'keys': []}
        elif len(pks) > 1:
            comp_keys = [[r[k] for k in pks] for r in rows]
            table_keys_receipt[tname] = {'pk_type': 'composite', 'pks': pks, 'keys': comp_keys}

    loader_lines.append("COMMIT;\n")

    TABLES_WITHOUT_TENANT = {
        'cmr_parties',
        'cmr_goods_lines',
        'cmr_attachments',
        'cmr_clauses',
        'cmr_expeditions',
        'cmr_signatures'
    }

    # Build rollback SQL in exact reverse topological order
    reverse_tables = list(reversed(list(dataset.keys())))
    for tname in reverse_tables:
        receipt_info = table_keys_receipt.get(tname)
        if not receipt_info:
            continue

        rollback_lines.append(f"-- Rollback table {tname}")
        if receipt_info['pk_type'] == 'single':
            pk_col = receipt_info['pk_col']
            keys = receipt_info['keys']
            if keys:
                in_clause = ', '.join(f"'{k}'" for k in keys)
                if tname in TABLES_WITHOUT_TENANT:
                    rollback_lines.append(f'DELETE FROM public.{tname} WHERE "{pk_col}" IN ({in_clause});\n')
                else:
                    rollback_lines.append(f'DELETE FROM public.{tname} WHERE "{pk_col}" IN ({in_clause}) AND tenant_id = \'{TENANT_ID}\';\n')
        elif receipt_info['pk_type'] == 'composite':
            pks = receipt_info['pks']
            pk_tuple = ', '.join(pks)
            comp_tuples = ', '.join(f"('{row_k[0]}', '{row_k[1]}')" for row_k in receipt_info['keys'])
            rollback_lines.append(f'DELETE FROM public.{tname} WHERE ({pk_tuple}) IN ({comp_tuples});\n')
        elif receipt_info['pk_type'] == 'identity':
            if tname == 'operational_events':
                in_codes = ', '.join(f"'{c}'" for c in receipt_info['correlation_keys'])
                rollback_lines.append(f'DELETE FROM public.operational_events WHERE tenant_id = \'{TENANT_ID}\' AND entity_code IN ({in_codes});\n')
            elif tname == 'customs_events':
                cases_keys = table_keys_receipt['customs_cases']['keys']
                in_cases = ', '.join(f"'{k}'" for k in cases_keys)
                rollback_lines.append(f'DELETE FROM public.customs_events WHERE case_id IN ({in_cases}) AND event_type = \'CASE_INITIALIZED\' AND tenant_id = \'{TENANT_ID}\';\n')

    rollback_lines.append("COMMIT;\n")

    return '\n'.join(loader_lines), '\n'.join(rollback_lines), table_keys_receipt

def normalize_rfc8785(val):
    """Normalize values according to RFC 8785 / ECMAScript JSON canonicalization:
    - Dicts: recursively normalize values
    - Lists: recursively normalize elements
    - Floats with zero fractional part: format as integer (e.g. 85.0 -> 85)
    - Nulls: None -> null
    - Strings: UTF-8 without unicode escaping
    """
    if isinstance(val, dict):
        return {k: normalize_rfc8785(v) for k, v in val.items()}
    elif isinstance(val, list):
        return [normalize_rfc8785(v) for v in val]
    elif isinstance(val, float) and val.is_integer():
        return int(val)
    return val

def canonical_row_json(row):
    """Deterministic canonical JSON string for a table row (RFC 8785 style)."""
    normalized = normalize_rfc8785(row)
    return json.dumps(normalized, sort_keys=True, separators=(',', ':'), ensure_ascii=False, default=str)

def compute_row_hash(row):
    return hashlib.sha256(canonical_row_json(row).encode('utf-8')).hexdigest()

def get_row_key_string(tname, row, pks):
    if len(pks) == 1:
        pk_col = pks[0]
        if pk_col in row and row[pk_col] is not None:
            return str(row[pk_col])
        if tname == 'operational_events':
            return f"entity_code:{row.get('entity_code')}"
        if tname == 'customs_events':
            return f"case_id:{row.get('case_id')}/event_type:{row.get('event_type')}"
        return f"idx:{row.get('id', 'unknown')}"
    elif len(pks) > 1:
        return "/".join(f"{col}:{row.get(col)}" for col in pks)
    return str(row.get('id', 'unknown'))

EXCEPTIONAL_22_TABLES = {
    'external_identifiers': {
        'category': 'system_identifier',
        'justification': "Junction de identificadores universales. Columna 'value' contiene exclusivamente códigos GS1 GLN normalizados de 13 dígitos con algoritmo de dígito de control mod-10 verificado. No existe columna metadata ni texto libre.",
        'provenance_anchor': "Tenant '00000000-0000-4000-8000-000000000001', entity_type 'party', entity_id vinculado a parties del lote, clave primaria id y hash canónico por fila."
    },
    'tariff_zone_members': {
        'category': 'relational_junction',
        'justification': "Tabla de unión relacional pura (tariff_zone_id, party_address_id). No contiene columnas de texto o metadatos.",
        'provenance_anchor': "Tenant titular, claves foráneas a tariff_zones y party_addresses del lote, y hash canónico por fila."
    },
    'party_adr_profiles': {
        'category': 'normative_safety',
        'justification': "Perfil normativo ADR por cliente. Columnas con listas cerradas de enums (frequency, validation_policy) y array de clases ADR tipadas. No admite texto libre ni metadatos sin violar restricciones de esquema.",
        'provenance_anchor': "Clave primaria party_id vinculada a parties del lote, tenant titular y hash canónico por fila."
    },
    'customer_billing_profiles': {
        'category': 'financial_pricing',
        'justification': "Configuración financiera y de facturación. Campos numéricos (credit_limit, payment_terms_days), booleanos y enums fiscales. Email de prueba @fornexatest.invalid. No contiene columna metadata.",
        'provenance_anchor': "Clave primaria party_id vinculada a parties del lote, tenant titular y hash canónico por fila."
    },
    'carrier_profiles': {
        'category': 'system_identifier',
        'justification': "Acreditación de transportistas. Licencia oficial MDPE-ES, póliza POL-TEST, cobertura numérica y enums de homologación. No contiene columna de metadatos genéricos.",
        'provenance_anchor': "Clave primaria party_id vinculada a parties del lote, tenant titular y hash canónico por fila."
    },
    'fuel_index_values': {
        'category': 'financial_pricing',
        'justification': "Histórico numérico de cotización de combustible (observed_value). Contiene estrictamente fechas y valores decimales calculados. Sin columna de metadatos.",
        'provenance_anchor': "Clave primaria id, fuel_index_id vinculado a fuel_indices del lote, tenant titular y hash canónico por fila."
    },
    'fuel_index_bands': {
        'category': 'financial_pricing',
        'justification': "Tramos y recargos de combustible (value_from, value_to, surcharge_percent, surcharge_amount). Campos estrictamente numéricos para el motor tarifario. Sin columna de texto o metadatos.",
        'provenance_anchor': "Clave primaria id, fuel_index_id vinculado a fuel_indices del lote, tenant titular y hash canónico por fila."
    },
    'product_packagings': {
        'category': 'inventory_storage',
        'justification': "Dimensiones físicas (peso, longitud, anchura, altura, volumen), empaquetado y código de barras. Valores numéricos de cubicaje sin columna de metadatos.",
        'provenance_anchor': "Clave primaria id, product_id vinculado a products del lote, tenant titular y hash canónico por fila."
    },
    'address_operational_profiles': {
        'category': 'inventory_storage',
        'justification': "Capacidades físicas de muelle/instalación (temperaturas, minutos de espera, booleans de ADR/rampa). Sin columna metadata.",
        'provenance_anchor': "Clave primaria address_id vinculada a party_addresses del lote, tenant titular y hash canónico por fila."
    },
    'party_address_assignments': {
        'category': 'relational_junction',
        'justification': "Asignación relacional entre clientes y direcciones con indicadores booleanos de recogida/entrega. Sin campos de texto.",
        'provenance_anchor': "Clave primaria id, address_id y party_id vinculados al lote, tenant titular y hash canónico por fila."
    },
    'warehouse_bins': {
        'category': 'inventory_storage',
        'justification': "Ubicaciones topológicas de almacén (aisle, rack, shelf, bin_position, max_weight_kg, max_volume_m3). Estructura física normalizada sin columna metadata.",
        'provenance_anchor': "Clave primaria id, warehouse_id y zone_id vinculados al lote, tenant titular y hash canónico por fila."
    },
    'tariff_lines': {
        'category': 'financial_pricing',
        'justification': "Líneas de tarifas del motor de pricing (precios unitarios, importes mínimos, recargos ADR, plataforma y descuentos). Añadir texto corrompería el cálculo financiero de tarifas.",
        'provenance_anchor': "Clave primaria id, tariff_header_id vinculado a tariff_headers del lote, tenant titular y hash canónico por fila."
    },
    'tariff_assignments': {
        'category': 'relational_junction',
        'justification': "Asignación de tarifas a partes colaboradoras. Claves foráneas UUID sin columnas de texto o metadatos.",
        'provenance_anchor': "Clave primaria id, tariff_header_id y party_id vinculados al lote, tenant titular y hash canónico por fila."
    },
    'tariff_rules': {
        'category': 'financial_pricing',
        'justification': "Reglas de tarificación con params JSONB validados contra params_schema_version. No admite texto libre arbitrario.",
        'provenance_anchor': "Clave primaria id, tariff_header_id vinculado a tariff_headers del lote, tenant titular y hash canónico por fila."
    },
    'transit_times': {
        'category': 'inventory_storage',
        'justification': "Tiempos de tránsito entre zonas tarifarias en minutos y días hábiles (campos enteros). Sin columna metadata.",
        'provenance_anchor': "Clave primaria id, origin_zone_id y destination_zone_id vinculados a tariff_zones del lote, tenant titular y hash canónico por fila."
    },
    'pricing_runs': {
        'category': 'financial_pricing',
        'justification': "Ejecución de cálculo de precios y cotizaciones. Desgloses numéricos de importes (pickup, linehaul, delivery, surcharge, total) y moneda EUR. Campos estrictamente monetarios.",
        'provenance_anchor': "Clave primaria id, tariff_header_id vinculado al lote, tenant titular y hash canónico por fila."
    },
    'order_hazmat_assessments': {
        'category': 'normative_safety',
        'justification': "Evaluación reglamentaria de mercancías peligrosas ADR por orden. Puntos totales (numéricos), categorías ADR y hash de entrada criptográfico input_hash. Inyectar cadenas alteraría el hash normativo.",
        'provenance_anchor': "Clave primaria id, order_id vinculado a orders del lote ('DATA150-ORD-...'), tenant titular y hash canónico por fila."
    },
    'inventory_quants': {
        'category': 'inventory_storage',
        'justification': "Stock físico en almacén. Cantidades numéricas (quantity_on_hand, quantity_reserved), lotes y números de serie con control de inventario. Sin columna metadata.",
        'provenance_anchor': "Clave primaria id, product_id y warehouse_id vinculados al lote, tenant titular y hash canónico por fila."
    },
    'expedition_delivery_notes': {
        'category': 'relational_junction',
        'justification': "Asociación relacional entre expediciones y albaranes. Claves foráneas UUID sin campos de texto.",
        'provenance_anchor': "Clave primaria id, expedition_id y delivery_note_id vinculados al lote, tenant titular y hash canónico por fila."
    },
    'trip_expeditions': {
        'category': 'relational_junction',
        'justification': "Secuencia de expediciones asignadas a viajes. Claves UUID y secuencia entera. Sin columna metadata.",
        'provenance_anchor': "Clave primaria id, trip_id y expedition_id vinculados al lote, tenant titular y hash canónico por fila."
    },
    'trip_stop_delivery_notes': {
        'category': 'relational_junction',
        'justification': "Operaciones de albarán en parada con restricción CHECK ('PICKUP', 'DELIVERY'). Sin columnas de texto libre.",
        'provenance_anchor': "Clave primaria id, trip_stop_id y delivery_note_id vinculados al lote, tenant titular y hash canónico por fila."
    },
    'trip_hazmat_assessments': {
        'category': 'normative_safety',
        'justification': "Evaluación reglamentaria ADR a nivel de viaje y parada. Puntos numéricos acumulados, categorías ADR y hash normativo input_hash. Sin columna metadata.",
        'provenance_anchor': "Clave primaria id, trip_id vinculado a trips del lote ('VIAJE-DATA150-...'), tenant titular y hash canónico por fila."
    }
}

def build_exhaustive_manifest(dataset, baseline_tables, git_anchor="71456653b834fd050d2832e0015219cbd47d4a22"):
    table_manifests = {}
    table_hashes = []
    physical_count = 0
    exceptional_count = 0

    for tname, rows in dataset.items():
        meta = baseline_tables.get(tname, {})
        pks = meta.get('primary_keys', [])
        is_exceptional = tname in EXCEPTIONAL_22_TABLES

        if is_exceptional:
            exceptional_count += 1
            marker_type = "EXCEPTIONAL_NO_MARKER"
            marker_info = {
                "is_exception": True,
                "category": EXCEPTIONAL_22_TABLES[tname]['category'],
                "justification": EXCEPTIONAL_22_TABLES[tname]['justification'],
                "provenance_anchor": EXCEPTIONAL_22_TABLES[tname]['provenance_anchor']
            }
        else:
            physical_count += 1
            marker_type = "PHYSICAL_MARKER"
            has_p = any('[PRUEBA]' in str(v) for r in rows for v in r.values())
            has_d = any('DATA150' in str(v) for r in rows for v in r.values())
            has_s = any(r.get('synthetic') is True or (isinstance(r.get('metadata'), dict) and r['metadata'].get('synthetic') is True) for r in rows)
            pattern = []
            if has_p: pattern.append("[PRUEBA]")
            if has_d: pattern.append("DATA150")
            if has_s: pattern.append("synthetic:true")
            marker_info = {
                "is_exception": False,
                "pattern": ", ".join(pattern) or "PHYSICAL_IN_ROW"
            }

        row_entries = []
        for row in rows:
            r_key = get_row_key_string(tname, row, pks)
            r_hash = compute_row_hash(row)
            row_entries.append({"key": r_key, "hash": r_hash})

        table_rows_hash = hashlib.sha256("".join(re['hash'] for re in row_entries).encode('utf-8')).hexdigest()
        table_hashes.append(table_rows_hash)

        table_manifests[tname] = {
            "row_count": len(rows),
            "sample_id": rows[0].get('id', rows[0].get('party_id', rows[0].get('address_id', 'composite'))),
            "has_tenant": 'tenant_id' in rows[0],
            "primary_keys": pks,
            "marker_classification": marker_type,
            "marker_details": marker_info,
            "rows_sha256": table_rows_hash,
            "row_entries": row_entries
        }

    dataset_merkle_root = hashlib.sha256("".join(table_hashes).encode('utf-8')).hexdigest()

    manifest = {
        "batch_id": BATCH_ID,
        "tenant_id": TENANT_ID,
        "generated_at": BASE_TIME.isoformat(),
        "git_anchor_commit": git_anchor,
        "canonicalization": "RFC-8785 JSON canonicalization (keys sorted recursively, UTF-8, no extra whitespace) with SHA-256",
        "summary": {
            "total_tables": len(dataset),
            "total_rows": sum(len(r) for r in dataset.values()),
            "tables_with_physical_marker": physical_count,
            "rows_with_physical_marker": physical_count * 150,
            "tables_exceptional_no_marker": exceptional_count,
            "rows_exceptional_no_marker": exceptional_count * 150,
            "dataset_merkle_root": dataset_merkle_root
        },
        "exceptional_tables_catalog": EXCEPTIONAL_22_TABLES,
        "tables": table_manifests
    }
    return manifest

def main():
    import preflight_schema_validation as validator
    baseline_tables = validator.load_baseline()

    print("Generating 70 business tables x 150 rows...")
    dataset = generate_all_tables()
    print(f"Generated {len(dataset)} tables.")

    print("Validating generated dataset against baseline schema...")
    errors, warnings, stats = validator.validate_dataset(dataset, baseline_tables)

    print("\n" + "="*50)
    print("VALIDATION RESULTS")
    print("="*50)
    print(f"Total tables: {stats['total_tables']}")
    print(f"Total rows: {stats['total_rows']}")
    print(f"Tables with invented columns: {stats['tables_with_invented_cols']}")
    print(f"Total invented columns: {stats['invented_cols_count']}")
    print(f"Missing required columns (warnings): {stats['missing_required_cols_count']}")
    print(f"Type mismatches: {stats['type_mismatches']}")
    print(f"CHECK constraint failures: {stats['check_constraint_failures']}")
    print(f"Critical errors: {len(errors)}")
    print("="*50)

    if errors:
        print("\n❌ VALIDATION FAILED! Top errors:")
        for err in errors[:25]:
            print(f"  {err}")
        return False

    print("\n✅ VALIDATION PASSED WITH 0 CRITICAL ERRORS AND 0 INVENTED COLUMNS!")

    # Write dataset JSON
    dataset_path = Path('docs/verification/data150-dataset.json')
    dataset_path.parent.mkdir(parents=True, exist_ok=True)
    with open(dataset_path, 'w', encoding='utf-8') as f:
        json.dump(dataset, f, indent=2)
    print(f"Saved dataset to {dataset_path}")

    # Generate SQL and receipt
    loader_sql, rollback_sql, receipt = generate_sql_loader_and_rollback(dataset, baseline_tables)

    receipt_path = Path('docs/verification/data150-receipt.json')
    with open(receipt_path, 'w', encoding='utf-8') as f:
        json.dump(receipt, f, indent=2)
    print(f"Saved durable PK receipt to {receipt_path}")

    # Write unexecuted pending placeholder for execution receipt (NOT planned keys or mock IDs)
    exec_receipt_path = Path('docs/verification/data150-execution-receipt.json')
    exec_placeholder = {
        'status': 'PENDING_EXECUTION',
        'batch_id': BATCH_ID,
        'tenant_id': TENANT_ID,
        'executed_at': None,
        'note': 'Execution receipt is generated upon live execution with RETURNING. Unexecuted prior to live run.',
        'tables': {}
    }
    with open(exec_receipt_path, 'w', encoding='utf-8') as f:
        json.dump(exec_placeholder, f, indent=2)
    print(f"Saved execution receipt placeholder to {exec_receipt_path}")

    manifest_path = Path('docs/verification/data150-manifest-20261009.json')
    manifest = build_exhaustive_manifest(dataset, baseline_tables, git_anchor="71456653b834fd050d2832e0015219cbd47d4a22")
    with open(manifest_path, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2)
    print(f"Saved manifest to {manifest_path}")

    loader_sql_path = Path('scripts/data150/data150-loader.sql')
    with open(loader_sql_path, 'w', encoding='utf-8') as f:
        f.write(loader_sql)
    print(f"Saved SQL loader to {loader_sql_path}")

    rollback_sql_path = Path('scripts/data150/data150-rollback.sql')
    rollback_stub = (
        "-- FORNEXA — DATA150 OPERATIONAL ROLLBACK STUB (FAIL-CLOSED)\n"
        "-- ==============================================================================\n"
        "-- ADVERTENCIA DE SEGURIDAD ESTRICTA:\n"
        "-- Este archivo NO contiene claves previstas ni SQL ejecutable estático.\n"
        "-- El procedimiento operativo vinculante exige generar el rollback EXCLUSIVAMENTE\n"
        "-- tras una ejecución confirmada consumiendo el recibo durable de ejecución real:\n"
        "--   node --experimental-strip-types scripts/data150/generate_rollback_from_receipt.ts\n"
        "-- Cualquier intento de ejecutar este archivo antes de la generación dinámica\n"
        "-- abortará inmediatamente la transacción con una excepción.\n"
        "-- ==============================================================================\n\n"
        "DO $$\n"
        "BEGIN\n"
        "  RAISE EXCEPTION 'SEGURIDAD FAIL-CLOSED: No existe rollback dinámico generado. "
        "Ejecute scripts/data150/generate_rollback_from_receipt.ts a partir del recibo COMMITTED.';\n"
        "END $$;\n"
    )
    with open(rollback_sql_path, 'w', encoding='utf-8') as f:
        f.write(rollback_stub)
    print(f"Saved fail-closed SQL rollback stub to {rollback_sql_path}")

    return True

if __name__ == '__main__':
    success = main()
    if not success:
        exit(1)
