"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Link from "next/link";

interface Member {
  id: string;
  name: string;
  email: string;
  type: string;
  points: number;
}

interface Committee {
  id: string;
  name: string;
  color: string;
  points: number;
}

interface Event {
  id: string;
  name: string;
  description: string | null;
  points: number;
  date: string;
}

export default function Home() {
  const [activeMembers, setActiveMembers] = useState<Member[]>([]);
  const [newMembers, setNewMembers] = useState<Member[]>([]);
  const [committees, setCommittees] = useState<Committee[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [membersRes, committeesRes, eventsRes] = await Promise.all([
        fetch("/api/members"),
        fetch("/api/committees"),
        fetch("/api/events"),
      ]);

      const membersData = await membersRes.json();
      const committeesData = await committeesRes.json();
      const eventsData = await eventsRes.json();

      setActiveMembers(
        membersData
          .filter((m: Member) => m.type === "activo")
          .sort((a: Member, b: Member) => b.points - a.points)
          .slice(0, 10)
      );
      setNewMembers(
        membersData
          .filter((m: Member) => m.type === "nuevo")
          .sort((a: Member, b: Member) => b.points - a.points)
          .slice(0, 10)
      );
      setCommittees(
        committeesData.sort((a: Committee, b: Committee) => b.points - a.points)
      );
      setEvents(eventsData.slice(0, 5));
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const getMedalColor = (index: number) => {
    if (index === 0) return "bg-yellow-500";
    if (index === 1) return "bg-gray-400";
    if (index === 2) return "bg-amber-600";
    return "bg-slate-600";
  };

  const Podium = ({
    title,
    data,
    type,
  }: {
    title: string;
    data: (Member | Committee)[];
    type: "member" | "committee";
  }) => (
    <Card className="border-none shadow-lg">
      <CardHeader className="gradient-bg text-white rounded-t-lg">
        <CardTitle className="text-center text-xl">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {data.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground">
            No hay datos aun
          </p>
        ) : (
          <div className="divide-y">
            {data.map((item, index) => (
              <div
                key={item.id}
                className="flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors"
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold ${getMedalColor(
                    index
                  )}`}
                >
                  {index + 1}
                </div>
                <div className="flex-1">
                  <p className="font-medium">{item.name}</p>
                  {type === "member" && (
                    <p className="text-sm text-muted-foreground">
                      {(item as Member).email}
                    </p>
                  )}
                </div>
                <Badge
                  variant="secondary"
                  className="bg-mustard text-white font-bold px-3 py-1"
                >
                  {item.points} pts
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <div className="min-h-screen gradient-bg flex items-center justify-center">
        <div className="text-white text-2xl animate-pulse">Cargando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="gradient-bg text-white py-12 px-4">
        <div className="max-w-6xl mx-auto text-center">
          <h1 className="text-5xl font-bold mb-4">GH POINTS</h1>
          <p className="text-xl opacity-90">
            Sistema de Recompensas - EAFIT 2026
          </p>
          <div className="mt-6">
            <Link
              href="/admin"
              className="inline-block bg-mustard hover:bg-orange text-white font-semibold px-6 py-2 rounded-lg transition-colors"
            >
              Panel Admin
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-8 -mt-8">
        <Tabs defaultValue="active" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 max-w-lg mx-auto">
            <TabsTrigger value="active">Activos</TabsTrigger>
            <TabsTrigger value="new">Nuevos</TabsTrigger>
            <TabsTrigger value="committees">Comites</TabsTrigger>
          </TabsList>

          <TabsContent value="active">
            <Podium
              title="Top 10 - Miembros Activos"
              data={activeMembers}
              type="member"
            />
          </TabsContent>

          <TabsContent value="new">
            <Podium
              title="Top 10 - Miembros Nuevos"
              data={newMembers}
              type="member"
            />
          </TabsContent>

          <TabsContent value="committees">
            <Podium
              title="Ranking de Comites"
              data={committees}
              type="committee"
            />
          </TabsContent>
        </Tabs>

        {/* Upcoming Events */}
        <section className="mt-12">
          <h2 className="text-2xl font-bold text-night-blue mb-6 text-center">
            Proximos Eventos
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {events.length === 0 ? (
              <Card className="col-span-full">
                <CardContent className="py-8 text-center text-muted-foreground">
                  No hay eventos programados
                </CardContent>
              </Card>
            ) : (
              events.map((event) => (
                <Card
                  key={event.id}
                  className="hover:shadow-lg transition-shadow"
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg text-night-blue">
                      {event.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-2">
                      {event.description || "Sin descripcion"}
                    </p>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">
                        {new Date(event.date).toLocaleDateString("es-CO")}
                      </span>
                      <Badge className="bg-sky-blue text-white">
                        +{event.points} pts
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="gradient-bg text-white py-6 mt-12">
        <div className="text-center opacity-75">
          <p>GH Points - EAFIT 2026</p>
        </div>
      </footer>
    </div>
  );
}
