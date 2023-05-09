# Etapa de configuración
print('¡Que comience el partido!')
while True:
    jugador1 = input("Ingrese el nombre del jugador 1: ")
    jugador2 = input("Ingrese el nombre del jugador 2: ")
    if jugador1 != "" and jugador2 != "":
        break

print("\n Los participantes son:", jugador1, "y", jugador2)

# Etapa del juego
puntos_jugador1 = 0
puntos_jugador2 = 0
juegos_jugador1 = 0
juegos_jugador2 = 0

while True:
    print("\nPuntuación actual:")
    print(jugador1, ":", 'Sets', juegos_jugador1,
          "-", 'Puntos', puntos_jugador1)
    print(jugador2, ":", 'Sets', juegos_jugador2,
          "-", 'Puntos', puntos_jugador2)
    print("Juego actual:", puntos_jugador1, "-", puntos_jugador2)

    opcion = input("\nIngrese 1 para darle un punto a " + jugador1 +
                   ", 2 para darle un punto a " + jugador2 + ", o 0 para salir: ")

    if opcion == "1":
        puntos_jugador1 += 10
        if puntos_jugador1 == 40 and puntos_jugador2 <= 20:
            print("¡Gana el juego el(la) participante! ", jugador1)
            juegos_jugador1 += 1
            puntos_jugador1 = 0
            puntos_jugador2 = 0
            if juegos_jugador1 == 7 or juegos_jugador1 == 14:
                print("¡Gana la partida el(la) participante! ", jugador1)
                break
        elif puntos_jugador1 == 30 and puntos_jugador2 == 30:
            print("Empatados!")
        elif puntos_jugador1 == 40 and puntos_jugador2 == 30:
            print("Ventaja para", jugador1)
        elif puntos_jugador1 == 50 and puntos_jugador2 == 30:
            print("¡Gana el juego el(la) participante! ", jugador1)
            juegos_jugador1 += 1
            puntos_jugador1 = 0
            puntos_jugador2 = 0
            if juegos_jugador1 == 7:
                print("¡El partido lo gana el(la) participante! ", jugador1)
                break
        elif puntos_jugador1 == 40 and puntos_jugador2 == 40:
            puntos_jugador2 = 30
            print("Ventaja para", jugador1)

    elif opcion == "2":
        puntos_jugador2 += 10
        if puntos_jugador2 == 40 and puntos_jugador1 <= 20:
            print("Gana el juego el(la) participante! ", jugador2)
            juegos_jugador2 += 1
            puntos_jugador1 = 0
            puntos_jugador2 = 0
            if juegos_jugador2 == 7:
                print("¡Gana la partida el(la) participante! ", jugador2)
                break
        elif puntos_jugador2 == 30 and puntos_jugador1 == 30:
            print("Empatados!")
        elif puntos_jugador2 == 40 and puntos_jugador1 == 30:
            print("Ventaja para", jugador2)
        elif puntos_jugador2 == 50 and puntos_jugador1 == 30:
            print("Gana el juego el(la) participante! ", jugador2)
            juegos_jugador2 += 1
            puntos_jugador1 = 0
            puntos_jugador2 = 0
            if juegos_jugador2 == 7 or juegos_jugador2 == 14:
                print("¡El partido lo gana el(la) participante! ", jugador2)
                break