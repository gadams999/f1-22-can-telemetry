package main

import (
	"context"
	"encoding/binary"
	"log"
	"net"
	"os"
	"os/signal"
	"syscall"

	"github.com/gadams999/f1telem/packet"
	"go.einride.tech/can"
	"go.einride.tech/can/pkg/socketcan"
)

func main() {
	log.Print("Starting f1telem service")

	// Setup run as service
	gracefulShutdown := make(chan os.Signal, 1)
	signal.Notify(gracefulShutdown, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		PORT := ":22222"

		s, err := net.ResolveUDPAddr("udp4", PORT)
		if err != nil {
			log.Println(err)
			return
		}

		connection, err := net.ListenUDP("udp4", s)
		if err != nil {
			log.Println(err)
			return
		}

		canCon, err := socketcan.DialContext(context.Background(), "can", "vcan0")
		if err != nil {
			log.Println(err)
			return
		}

		defer connection.Close()
		buffer := make([]byte, 2048)

		for {
			// Read  UDP packet into buffer
			n, addr, err := connection.ReadFromUDP(buffer)
			if err != nil {
				log.Println("read udp failed", n, addr, err)
				continue
			}

			// If event type is 6 (telemetry) process
			eventType := packet.EventType(buffer)
			if eventType == 6 {
				telemetryData, err := packet.TelemetryPacket(buffer)
				if err != nil {
					log.Println("Error parsing telemetry packet ", err)
				}

				// Read the player's car telemetry
				playerData, err := packet.PlayerData(telemetryData)
				if err != nil {
					log.Println("Error getting player data ", err)
				}
				SendToCan(playerData, canCon)
			}
		}
	}()

	<-gracefulShutdown
	log.Print("Stopping f1telem service")
}

func SendToCan(telem packet.PlayerTelemetryData, conn net.Conn) {
	var speed_obd2 uint8
	var speed_custom uint16
	var rpm_obd2 uint16
	var throttle_obd2 uint8
	var frame can.Frame
	tx := socketcan.NewTransmitter(conn)

	// Write the vehicle speed to CAN
	if telem.CarTelemetryData.M_speed <= 255 {
		speed_obd2 = uint8(telem.CarTelemetryData.M_speed)
	} else {
		speed_obd2 = 255
	}
	speed_custom = telem.CarTelemetryData.M_speed
	// OBD2
	frame.ID = 0xd
	frame.Length = 1
	CanFrameUnsignedBigEndian(&frame, uint64(speed_obd2))
	_ = tx.TransmitFrame(context.Background(), frame)
	// Custom (PID 0xd0)
	frame.ID = 0xd0
	frame.Length = 2
	CanFrameUnsignedBigEndian(&frame, uint64(speed_custom))
	_ = tx.TransmitFrame(context.Background(), frame)

	// Write the RPM value to CAN
	// OBD2 rpm = (A*256 + B)/4
	rpm_obd2 = telem.CarTelemetryData.M_engineRPM * 4
	frame.ID = 0xc
	frame.Length = 2
	CanFrameUnsignedBigEndian(&frame, uint64(rpm_obd2))
	_ = tx.TransmitFrame(context.Background(), frame)

	// Write Throttle position to CAN
	// OBD2 throttle = (100/255)*A
	throttle_obd2 = uint8(telem.CarTelemetryData.M_throttle * 255)
	frame.ID = 0x11
	frame.Length = 1
	CanFrameUnsignedBigEndian(&frame, uint64(throttle_obd2))
	_ = tx.TransmitFrame(context.Background(), frame)
}

// Copy the Unsigned value to the CAN frame in big endian format
func CanFrameUnsignedBigEndian(frame *can.Frame, value uint64) {
	buf := make([]byte, frame.Length)
	switch frame.Length {
	case 1:
		buf[0] = uint8(value)
	case 2:
		binary.BigEndian.PutUint16(buf, uint16(value))
	case 4:
		binary.BigEndian.PutUint32(buf, uint32(value))
	case 8:
		binary.BigEndian.PutUint64(buf, uint64(value))
	}
	copy(frame.Data[:frame.Length], buf)
}
