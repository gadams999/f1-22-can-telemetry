package packet

type pktHeader struct {
	M_packetFormat            uint16
	M_gameMajorVersion        uint8
	M_gameMinorVersion        uint8
	M_packetVersion           uint8
	M_packetId                uint8
	M_sessionUID              uint64
	M_sessionTime             float32
	M_frameIdentifier         uint32
	M_playerCarIndex          uint8
	M_secondaryPlayerCarIndex uint8
}
